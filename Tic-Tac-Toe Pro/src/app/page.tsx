'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { io, Socket } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'

// Card types and interfaces
interface GameCard {
  id: string
  name: string
  description: string
  type: string
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  quantity: number
  used: number
}

interface Player {
  id: string
  name: string
  symbol: 'X' | 'O'
  isCurrent: boolean
  cards: GameCard[]
}

interface GameState {
  board: (string | null)[]
  currentPlayer: string
  players: Player[]
  status: 'WAITING' | 'PLAYING' | 'FINISHED'
  winner: string | null
  boardSize: number
  roomId: string
  blockedCells: number[]
}

interface GameStats {
  wins: number
  losses: number
  draws: number
  streak: number
}

interface AIPlayer {
  difficulty: 'easy' | 'medium' | 'hard'
  thinking: boolean
}

const CARD_TYPES = {
  PROTECTION: {
    name: 'Protection',
    description: 'After 3 wins in a row, get this card. If you lose the next game, it counts as a draw instead.',
    rarity: 'RARE' as const,
    icon: '🛡️',
    color: 'from-blue-500 to-blue-600'
  },
  GIANT: {
    name: 'Giant',
    description: 'After 5 wins in a row, get this card. Place two marks at the start of the next game.',
    rarity: 'EPIC' as const,
    icon: '🦍',
    color: 'from-purple-500 to-purple-600'
  },
  DOUBLE_MOVE: {
    name: 'Double Move',
    description: 'Play two moves in one turn.',
    rarity: 'COMMON' as const,
    icon: '⚡',
    color: 'from-yellow-500 to-yellow-600'
  },
  BLOCK: {
    name: 'Block',
    description: 'Choose one cell and block it for the rest of the game.',
    rarity: 'COMMON' as const,
    icon: '🚫',
    color: 'from-red-500 to-red-600'
  },
  SWAP_CELL: {
    name: 'Swap Cell',
    description: 'Swap one of your marks with one opponent mark.',
    rarity: 'RARE' as const,
    icon: '🔄',
    color: 'from-indigo-500 to-indigo-600'
  },
  TIME_FREEZE: {
    name: 'Time Freeze',
    description: 'Freeze opponent\'s timer for 10 seconds.',
    rarity: 'RARE' as const,
    icon: '❄️',
    color: 'from-cyan-500 to-cyan-600'
  },
  WILDCARD: {
    name: 'Wildcard',
    description: 'Place a mark that can count as X or O at the end of the game.',
    rarity: 'EPIC' as const,
    icon: '🃏',
    color: 'from-pink-500 to-pink-600'
  },
  SHIELD: {
    name: 'Shield',
    description: 'Protect your next move from being swapped or blocked.',
    rarity: 'COMMON' as const,
    icon: '🛡️',
    color: 'from-green-500 to-green-600'
  },
  TELEPORT: {
    name: 'Teleport',
    description: 'Move one of your existing marks to any empty cell.',
    rarity: 'EPIC' as const,
    icon: '🌀',
    color: 'from-teal-500 to-teal-600'
  },
  MIRROR: {
    name: 'Mirror',
    description: 'Copy the opponent\'s last move to a symmetric position.',
    rarity: 'LEGENDARY' as const,
    icon: '🪞',
    color: 'from-violet-500 to-violet-600'
  },
  RESET: {
    name: 'Reset',
    description: 'Reset the board to its state 3 moves ago.',
    rarity: 'LEGENDARY' as const,
    icon: '🔄',
    color: 'from-orange-500 to-orange-600'
  }
}

export default function TicTacToe() {
  const [gameState, setGameState] = useState<GameState>({
    board: Array(9).fill(null),
    currentPlayer: '',
    players: [],
    status: 'WAITING',
    winner: null,
    boardSize: 3,
    roomId: '',
    blockedCells: []
  })
  
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [roomIdInput, setRoomIdInput] = useState('')
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [gameStats, setGameStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0, streak: 0 })
  const [isConnected, setIsConnected] = useState(false)
  const [activeCardEffect, setActiveCardEffect] = useState<string | null>(null)
  const [gameMode, setGameMode] = useState<'multiplayer' | 'singleplayer'>('multiplayer')
  const [aiPlayer, setAiPlayer] = useState<AIPlayer>({ difficulty: 'medium', thinking: false })
  
  const { toast } = useToast()

  // Initialize socket connection
  useEffect(() => {
    if (gameMode === 'multiplayer') {
      const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001')
      setSocket(newSocket)

      newSocket.on('connect', () => {
        setIsConnected(true)
        toast({
          title: 'Connected to server',
          description: 'You can now create or join a game room.',
        })
      })

      newSocket.on('disconnect', () => {
        setIsConnected(false)
        toast({
          title: 'Disconnected from server',
          description: 'Please check your connection.',
          variant: 'destructive',
        })
      })

      newSocket.on('gameStateUpdate', (newGameState: GameState) => {
        setGameState(newGameState)
      })

      newSocket.on('playerJoined', (data: { players: Player[] }) => {
        toast({
          title: 'Player joined',
          description: 'Game can now start!',
        })
      })

      newSocket.on('gameOver', (data: { winner: string | null, stats: GameStats }) => {
        setGameStats(data.stats)
        if (data.winner) {
          toast({
            title: 'Game Over',
            description: `Player ${data.winner} wins!`,
          })
        } else {
          toast({
            title: 'Game Over',
            description: 'It\'s a draw!',
          })
        }
      })

      newSocket.on('cardUsed', (data: { cardName: string, playerId: string }) => {
        toast({
          title: 'Card Used',
          description: `${data.cardName} card was used!`,
        })
      })

      return () => {
        newSocket.close()
      }
    } else {
      setSocket(null)
      setIsConnected(false)
    }
  }, [gameMode, toast])

  const createRoom = useCallback(() => {
    if (!playerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your name',
        variant: 'destructive',
      })
      return
    }

    const roomId = uuidv4()
    socket?.emit('createRoom', { roomId, playerName, boardSize: gameState.boardSize })
    setGameState(prev => ({ ...prev, roomId }))
    toast({
      title: 'Room Created',
      description: `Room ID: ${roomId}`,
    })
  }, [playerName, socket, gameState.boardSize, toast])

  const joinRoom = useCallback(() => {
    if (!playerName.trim() || !roomIdInput.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your name and room ID',
        variant: 'destructive',
      })
      return
    }

    socket?.emit('joinRoom', { roomId: roomIdInput, playerName })
    setGameState(prev => ({ ...prev, roomId: roomIdInput }))
  }, [playerName, roomIdInput, socket, toast])

  const startSinglePlayerGame = useCallback(() => {
    if (!playerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your name',
        variant: 'destructive',
      })
      return
    }

    const roomId = `single-${uuidv4()}`
    const newGameState: GameState = {
      board: Array(gameState.boardSize * gameState.boardSize).fill(null),
      currentPlayer: 'player',
      players: [
        {
          id: 'player',
          name: playerName,
          symbol: 'X',
          isCurrent: true,
          cards: []
        },
        {
          id: 'ai',
          name: `AI (${aiPlayer.difficulty})`,
          symbol: 'O',
          isCurrent: false,
          cards: []
        }
      ],
      status: 'PLAYING',
      winner: null,
      boardSize: gameState.boardSize,
      roomId,
      blockedCells: []
    }
    
    setGameState(newGameState)
    toast({
      title: 'Single Player Game Started',
      description: `Playing against ${aiPlayer.difficulty} AI`,
    })
  }, [playerName, gameState.boardSize, aiPlayer.difficulty, toast])

  const makeMove = useCallback((position: number) => {
    if (gameState.status !== 'PLAYING') return
    
    if (gameMode === 'multiplayer') {
      if (gameState.currentPlayer !== socket?.id) return
      if (gameState.board[position] !== null || gameState.blockedCells.includes(position)) return

      socket?.emit('makeMove', { 
        roomId: gameState.roomId, 
        position, 
        cardType: selectedCard 
      })
    } else {
      // Single player mode
      if (gameState.currentPlayer !== 'player') return
      if (gameState.board[position] !== null || gameState.blockedCells.includes(position)) return

      const newBoard = [...gameState.board]
      newBoard[position] = 'X'
      
      const newGameState = {
        ...gameState,
        board: newBoard,
        currentPlayer: 'ai'
      }
      
      setGameState(newGameState)
      
      // Check for winner
      const winner = checkWinner(newBoard, gameState.boardSize)
      if (winner) {
        setGameState(prev => ({ ...prev, status: 'FINISHED', winner }))
        const newStats = { ...gameStats, wins: gameStats.wins + 1, streak: gameStats.streak + 1 }
        setGameStats(newStats)
        toast({
          title: 'You Win!',
          description: 'Congratulations on your victory!',
        })
        return
      }
      
      if (isBoardFull(newBoard)) {
        setGameState(prev => ({ ...prev, status: 'FINISHED', winner: null }))
        const newStats = { ...gameStats, draws: gameStats.draws + 1, streak: 0 }
        setGameStats(newStats)
        toast({
          title: 'Draw!',
          description: 'Great game!',
        })
        return
      }
      
      // AI move
      setAiPlayer(prev => ({ ...prev, thinking: true }))
      setTimeout(() => {
        const aiMove = getAIMove(newBoard, gameState.boardSize, aiPlayer.difficulty)
        if (aiMove !== -1) {
          const aiBoard = [...newBoard]
          aiBoard[aiMove] = 'O'
          
          const finalGameState = {
            ...newGameState,
            board: aiBoard,
            currentPlayer: 'player'
          }
          
          setGameState(finalGameState)
          setAiPlayer(prev => ({ ...prev, thinking: false }))
          
          // Check for AI winner
          const aiWinner = checkWinner(aiBoard, gameState.boardSize)
          if (aiWinner) {
            setGameState(prev => ({ ...prev, status: 'FINISHED', winner: aiWinner }))
            const newStats = { ...gameStats, losses: gameStats.losses + 1, streak: 0 }
            setGameStats(newStats)
            toast({
              title: 'AI Wins!',
              description: 'Better luck next time!',
            })
            return
          }
          
          if (isBoardFull(aiBoard)) {
            setGameState(prev => ({ ...prev, status: 'FINISHED', winner: null }))
            const newStats = { ...gameStats, draws: gameStats.draws + 1, streak: 0 }
            setGameStats(newStats)
            toast({
              title: 'Draw!',
              description: 'Great game!',
            })
          }
        }
      }, 1000)
    }
    
    if (selectedCard) {
      setSelectedCard(null)
    }
  }, [gameState, socket, selectedCard, gameMode, gameStats, aiPlayer.difficulty, toast])

  const getAIMove = (board: (string | null)[], size: number, difficulty: string): number => {
    const emptyCells = board.map((cell, index) => cell === null ? index : -1).filter(i => i !== -1)
    
    if (emptyCells.length === 0) return -1
    
    if (difficulty === 'easy') {
      // Random move
      return emptyCells[Math.floor(Math.random() * emptyCells.length)]
    }
    
    if (difficulty === 'medium') {
      // Try to win, then block, then random
      const winMove = findWinningMove(board, size, 'O')
      if (winMove !== -1) return winMove
      
      const blockMove = findWinningMove(board, size, 'X')
      if (blockMove !== -1) return blockMove
      
      return emptyCells[Math.floor(Math.random() * emptyCells.length)]
    }
    
    if (difficulty === 'hard') {
      // Minimax algorithm for perfect play
      return getBestMove(board, size)
    }
    
    return emptyCells[0]
  }

  const findWinningMove = (board: (string | null)[], size: number, player: string): number => {
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        const newBoard = [...board]
        newBoard[i] = player
        if (checkWinner(newBoard, size) === player) {
          return i
        }
      }
    }
    return -1
  }

  const getBestMove = (board: (string | null)[], size: number): number => {
    let bestScore = -Infinity
    let bestMove = -1
    
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        const newBoard = [...board]
        newBoard[i] = 'O'
        const score = minimax(newBoard, size, 0, false)
        if (score > bestScore) {
          bestScore = score
          bestMove = i
        }
      }
    }
    
    return bestMove
  }

  const minimax = (board: (string | null)[], size: number, depth: number, isMaximizing: boolean): number => {
    const winner = checkWinner(board, size)
    
    if (winner === 'O') return 10 - depth
    if (winner === 'X') return depth - 10
    if (isBoardFull(board)) return 0
    
    if (isMaximizing) {
      let bestScore = -Infinity
      for (let i = 0; i < board.length; i++) {
        if (board[i] === null) {
          const newBoard = [...board]
          newBoard[i] = 'O'
          const score = minimax(newBoard, size, depth + 1, false)
          bestScore = Math.max(score, bestScore)
        }
      }
      return bestScore
    } else {
      let bestScore = Infinity
      for (let i = 0; i < board.length; i++) {
        if (board[i] === null) {
          const newBoard = [...board]
          newBoard[i] = 'X'
          const score = minimax(newBoard, size, depth + 1, true)
          bestScore = Math.min(score, bestScore)
        }
      }
      return bestScore
    }
  }

  const handleCardUse = useCallback((cardType: string) => {
    if (gameState.status !== 'PLAYING') return
    if (gameMode === 'multiplayer' && gameState.currentPlayer !== socket?.id) return
    if (gameMode === 'singleplayer' && gameState.currentPlayer !== 'player') return
    
    setSelectedCard(cardType)
    setActiveCardEffect(cardType)
    
    // Auto-clear card effect after 5 seconds if not used
    setTimeout(() => {
      setActiveCardEffect(null)
      setSelectedCard(null)
    }, 5000)
  }, [gameState, socket, gameMode])

  const useCard = useCallback((cardType: string) => {
    handleCardUse(cardType)
  }, [handleCardUse])

  const changeBoardSize = useCallback((size: number) => {
    setGameState(prev => ({
      ...prev,
      boardSize: size,
      board: Array(size * size).fill(null)
    }))
  }, [])

  const checkWinner = useCallback((board: (string | null)[], size: number): string | null => {
    const lines = []
    
    // Rows
    for (let i = 0; i < size; i++) {
      const row = []
      for (let j = 0; j < size; j++) {
        row.push(i * size + j)
      }
      lines.push(row)
    }
    
    // Columns
    for (let i = 0; i < size; i++) {
      const col = []
      for (let j = 0; j < size; j++) {
        col.push(j * size + i)
      }
      lines.push(col)
    }
    
    // Diagonals
    const diag1 = []
    const diag2 = []
    for (let i = 0; i < size; i++) {
      diag1.push(i * size + i)
      diag2.push(i * size + (size - 1 - i))
    }
    lines.push(diag1, diag2)
    
    for (const line of lines) {
      const values = line.map(i => board[i])
      if (values.every(val => val === 'X')) return 'X'
      if (values.every(val => val === 'O')) return 'O'
    }
    
    return null
  }, [])

  const isBoardFull = useCallback((board: (string | null)[]): boolean => {
    return board.every(cell => cell !== null)
  }, [])

  const renderBoard = () => {
    const { board, boardSize, blockedCells } = gameState
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer)
    
    return (
      <div className="relative">
        {/* Board background with gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100 via-purple-50 to-red-100 rounded-2xl blur-xl opacity-50"></div>
        
        <div 
          className={`relative grid gap-3 p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 ${
            boardSize === 3 ? 'grid-cols-3' : boardSize === 4 ? 'grid-cols-4' : 'grid-cols-5'
          }`}
        >
          {board.map((cell, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: cell ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`
                relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center
                text-2xl md:text-3xl font-bold rounded-xl cursor-pointer
                transition-all duration-300 border-2 shadow-lg
                ${cell === 'X' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-700 shadow-blue-500/25' : 
                  cell === 'O' ? 'bg-gradient-to-br from-red-500 to-red-600 text-white border-red-700 shadow-red-500/25' : 
                  blockedCells.includes(index) ? 'bg-gradient-to-br from-gray-400 to-gray-500 cursor-not-allowed border-gray-600 shadow-gray-500/25' :
                  'bg-gradient-to-br from-white to-gray-50 border-gray-300 hover:border-purple-400 hover:shadow-purple-500/25'}
                ${gameState.status === 'PLAYING' && !cell && !blockedCells.includes(index) && 
                  (gameMode === 'multiplayer' ? gameState.currentPlayer === socket?.id : gameState.currentPlayer === 'player') ? 
                  'hover:shadow-xl hover:scale-105' : ''}
              `}
              onClick={() => makeMove(index)}
            >
              {cell === 'X' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-white drop-shadow-lg"
                >
                  ✕
                </motion.span>
              )}
              {cell === 'O' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-white drop-shadow-lg"
                >
                  ○
                </motion.span>
              )}
              {blockedCells.includes(index) && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-gray-600 drop-shadow-lg"
                >
                  🚫
                </motion.span>
              )}
              
              {/* Card effect indicator */}
              {activeCardEffect && (
                <motion.div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  style={{
                    background: activeCardEffect === 'BLOCK' ? 'linear-gradient(45deg, #ef4444, #dc2626)' :
                             activeCardEffect === 'SWAP_CELL' ? 'linear-gradient(45deg, #8b5cf6, #7c3aed)' :
                             activeCardEffect === 'DOUBLE_MOVE' ? 'linear-gradient(45deg, #eab308, #ca8a04)' :
                             'linear-gradient(45deg, #3b82f6, #2563eb)'
                  }}
                />
              )}
              
              {/* Hover effect */}
              {gameState.status === 'PLAYING' && !cell && !blockedCells.includes(index) && 
               (gameMode === 'multiplayer' ? gameState.currentPlayer === socket?.id : gameState.currentPlayer === 'player') && (
                <motion.div
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-400/20 to-blue-400/20 pointer-events-none"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  const renderCards = () => {
    const currentPlayer = gameState.players.find(p => 
      gameMode === 'multiplayer' ? p.id === socket?.id : p.id === 'player'
    )
    if (!currentPlayer) return null

    return (
      <div className="relative">
        {/* Cards background */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-100/50 to-blue-100/50 rounded-2xl blur-xl"></div>
        
        <div className="relative flex gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-x-auto">
          {currentPlayer.cards.map((card) => (
            <TooltipProvider key={card.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className={`
                      flex flex-col items-center p-4 rounded-xl cursor-pointer
                      min-w-[90px] border-2 transition-all duration-300 shadow-lg
                      ${card.quantity > 0 ? 
                        `bg-gradient-to-br ${CARD_TYPES[card.type as keyof typeof CARD_TYPES]?.color || 'from-gray-500 to-gray-600'} 
                         text-white border-white/30 hover:shadow-xl ${selectedCard === card.type ? 'ring-4 ring-yellow-400 ring-opacity-50' : ''}` :
                        'bg-gradient-to-br from-gray-300 to-gray-400 border-gray-400 opacity-50 cursor-not-allowed'}
                    `}
                    onClick={() => card.quantity > 0 && handleCardUse(card.type)}
                  >
                    <span className="text-3xl mb-2 drop-shadow-lg">{CARD_TYPES[card.type as keyof typeof CARD_TYPES]?.icon || '🎴'}</span>
                    <span className="text-xs font-bold text-center mb-1">
                      {CARD_TYPES[card.type as keyof typeof CARD_TYPES]?.name || card.name}
                    </span>
                    <Badge variant="secondary" className="mb-1 text-xs bg-white/20 text-white border-white/30">
                      {card.quantity}
                    </Badge>
                    <Badge 
                      variant={card.rarity === 'LEGENDARY' ? 'destructive' : 
                              card.rarity === 'EPIC' ? 'default' :
                              card.rarity === 'RARE' ? 'secondary' : 'outline'}
                      className="text-xs bg-white/20 text-white border-white/30"
                    >
                      {card.rarity}
                    </Badge>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3 bg-gray-900 text-white">
                  <p className="font-semibold mb-1">{CARD_TYPES[card.type as keyof typeof CARD_TYPES]?.name || card.name}</p>
                  <p className="text-sm">{card.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>
    )
  }

  const renderGameStats = () => (
    <Card className="w-full bg-gradient-to-br from-white to-gray-50 shadow-xl border-0 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <CardTitle className="text-xl font-bold">Game Statistics</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
            <div className="text-3xl font-bold text-green-600 mb-1">{gameStats.wins}</div>
            <div className="text-sm text-green-700 font-medium">Wins</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-xl">
            <div className="text-3xl font-bold text-red-600 mb-1">{gameStats.losses}</div>
            <div className="text-sm text-red-700 font-medium">Losses</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
            <div className="text-3xl font-bold text-gray-600 mb-1">{gameStats.draws}</div>
            <div className="text-sm text-gray-700 font-medium">Draws</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl">
            <div className="text-3xl font-bold text-yellow-600 mb-1">{gameStats.streak}</div>
            <div className="text-sm text-yellow-700 font-medium">Streak</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-red-50 p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-red-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 bg-clip-text text-transparent mb-4">
            Tic-Tac-Toe Pro
          </h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 font-medium">
            Play with friends or challenge AI • Collect powerful cards • Dominate the board
          </p>
        </motion.div>

        {/* Game Mode Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-full p-1 shadow-xl border border-white/20">
            <Button
              variant={gameMode === 'multiplayer' ? 'default' : 'ghost'}
              onClick={() => setGameMode('multiplayer')}
              className={`rounded-full px-6 py-3 font-medium ${
                gameMode === 'multiplayer' 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg' 
                  : 'text-gray-700 hover:text-blue-600'
              }`}
            >
              Multiplayer
            </Button>
            <Button
              variant={gameMode === 'singleplayer' ? 'default' : 'ghost'}
              onClick={() => setGameMode('singleplayer')}
              className={`rounded-full px-6 py-3 font-medium ${
                gameMode === 'singleplayer' 
                  ? 'bg-gradient-to-r from-purple-600 to-red-600 text-white shadow-lg' 
                  : 'text-gray-700 hover:text-purple-600'
              }`}
            >
              Single Player
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Game Board */}
          <div className="xl:col-span-2 space-y-6">
            {/* Game Board Card */}
            <Card className="bg-white/80 backdrop-blur-sm shadow-2xl border-0 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-2xl font-bold">Game Board</CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Board Size:</span>
                    <Select value={gameState.boardSize.toString()} onValueChange={(value) => changeBoardSize(parseInt(value))}>
                      <SelectTrigger className="w-20 bg-white/20 border-white/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3×3</SelectItem>
                        <SelectItem value="4">4×4</SelectItem>
                        <SelectItem value="5">5×5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {gameState.roomId || gameMode === 'singleplayer' ? (
                  <div className="space-y-6">
                    {/* Game Status */}
                    <div className="flex justify-between items-center">
                      <Badge 
                        variant={gameState.status === 'PLAYING' ? 'default' : 'secondary'}
                        className={`px-4 py-2 text-sm font-medium ${
                          gameState.status === 'PLAYING' 
                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' 
                            : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
                        }`}
                      >
                        {gameState.status}
                      </Badge>
                      {gameMode === 'multiplayer' && gameState.roomId && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 font-medium">Room:</span>
                          <Badge variant="outline" className="px-3 py-1 text-sm font-mono">
                            {gameState.roomId}
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {/* Players */}
                    {gameState.players.length > 0 && (
                      <div className="flex justify-center gap-4">
                        {gameState.players.map((player) => (
                          <motion.div
                            key={player.id}
                            whileHover={{ scale: 1.05 }}
                            className={`px-6 py-3 rounded-xl font-bold text-white shadow-lg ${
                              player.id === gameState.currentPlayer
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 ring-4 ring-blue-400/50'
                                : 'bg-gradient-to-r from-gray-500 to-gray-600'
                            }`}
                          >
                            <span>{player.name}</span>
                            <span className="ml-2 text-2xl">{player.symbol}</span>
                            {aiPlayer.thinking && player.id === 'ai' && (
                              <span className="ml-2 text-sm">🤔</span>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                    
                    {/* Game Board */}
                    {renderBoard()}
                    
                    {/* Winner Announcement */}
                    {gameState.winner && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center p-6 bg-gradient-to-r from-green-100 to-green-200 rounded-2xl shadow-xl"
                      >
                        <h3 className="text-3xl font-bold text-green-800 mb-2">
                          {gameState.winner === 'DRAW' ? '🤝 It\'s a Draw!' : `🎉 Player ${gameState.winner} Wins!`}
                        </h3>
                        <p className="text-green-700 font-medium">
                          {gameState.winner === 'DRAW' ? 'Great game!' : 'Congratulations on your victory!'}
                        </p>
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🎮</div>
                    <p className="text-lg text-gray-600 font-medium mb-4">
                      {gameMode === 'multiplayer' ? 'Create or join a room to start playing' : 'Start a new game to play against AI'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cards */}
            {gameState.status === 'PLAYING' && renderCards()}
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Connection Status */}
            {gameMode === 'multiplayer' && (
              <Card className="bg-white/80 backdrop-blur-sm shadow-xl border-0">
                <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
                  <CardTitle className="text-lg font-bold">Connection</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Game Controls */}
            <Card className="bg-white/80 backdrop-blur-sm shadow-xl border-0">
              <CardHeader className="bg-gradient-to-r from-purple-600 to-red-600 text-white p-4">
                <CardTitle className="text-lg font-bold">Game Controls</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {gameMode === 'multiplayer' ? (
                  <Tabs defaultValue="create" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="create" className="font-medium">Create Room</TabsTrigger>
                      <TabsTrigger value="join" className="font-medium">Join Room</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="create" className="space-y-4">
                      <div>
                        <Label htmlFor="playerName" className="text-sm font-medium text-gray-700">Your Name</Label>
                        <Input
                          id="playerName"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder="Enter your name"
                          className="mt-1"
                        />
                      </div>
                      <Button 
                        onClick={createRoom} 
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium"
                      >
                        Create Room
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="join" className="space-y-4">
                      <div>
                        <Label htmlFor="playerNameJoin" className="text-sm font-medium text-gray-700">Your Name</Label>
                        <Input
                          id="playerNameJoin"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder="Enter your name"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="roomId" className="text-sm font-medium text-gray-700">Room ID</Label>
                        <Input
                          id="roomId"
                          value={roomIdInput}
                          onChange={(e) => setRoomIdInput(e.target.value)}
                          placeholder="Enter room ID"
                          className="mt-1"
                        />
                      </div>
                      <Button 
                        onClick={joinRoom} 
                        className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 text-white font-medium"
                      >
                        Join Room
                      </Button>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="playerNameSingle" className="text-sm font-medium text-gray-700">Your Name</Label>
                      <Input
                        id="playerNameSingle"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Enter your name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">AI Difficulty</Label>
                      <Select value={aiPlayer.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setAiPlayer(prev => ({ ...prev, difficulty: value }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      onClick={startSinglePlayerGame} 
                      className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 text-white font-medium"
                    >
                      Start Game
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Game Stats */}
            {renderGameStats()}

            {/* Card Reference */}
            <Card className="bg-white/80 backdrop-blur-sm shadow-xl border-0">
              <CardHeader className="bg-gradient-to-r from-red-600 to-purple-600 text-white p-4">
                <CardTitle className="text-lg font-bold">Card Reference</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {Object.entries(CARD_TYPES).map(([key, card]) => (
                    <motion.div
                      key={key}
                      whileHover={{ scale: 1.02 }}
                      className="flex items-start gap-3 p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200"
                    >
                      <span className="text-2xl">{card.icon}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-800 mb-1">{card.name}</div>
                        <div className="text-xs text-gray-600 mb-2">{card.description}</div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs font-medium ${
                            card.rarity === 'LEGENDARY' ? 'border-red-500 text-red-600' :
                            card.rarity === 'EPIC' ? 'border-purple-500 text-purple-600' :
                            card.rarity === 'RARE' ? 'border-blue-500 text-blue-600' :
                            'border-gray-500 text-gray-600'
                          }`}
                        >
                          {card.rarity}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx global>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}