import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient()

// Game state interfaces
interface GameState {
  board: (string | null)[]
  currentPlayer: string
  players: Player[]
  status: 'WAITING' | 'PLAYING' | 'FINISHED'
  winner: string | null
  boardSize: number
  roomId: string
  blockedCells: number[]
  moveHistory: { position: number; symbol: string; playerId: string; timestamp: Date }[]
}

interface Player {
  id: string
  name: string
  symbol: 'X' | 'O'
  isCurrent: boolean
  cards: GameCard[]
}

interface GameCard {
  id: string
  name: string
  description: string
  type: string
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  quantity: number
  used: number
}

interface GameRoom {
  id: string
  roomId: string
  boardSize: number
  boardState: string
  currentTurn: string
  status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'ABANDONED'
  winner: string | null
  players: Player[]
  blockedCells: number[]
  moveHistory: { position: number; symbol: string; playerId: string; timestamp: Date }[]
}

// In-memory game rooms storage
const gameRooms = new Map<string, GameRoom>()

// Card definitions
const CARD_TYPES = {
  PROTECTION: {
    name: 'Protection',
    description: 'After 3 wins in a row, get this card. If you lose the next game, it counts as a draw instead.',
    rarity: 'RARE' as const,
    effect: 'protection'
  },
  GIANT: {
    name: 'Giant',
    description: 'After 5 wins in a row, get this card. Place two marks at the start of the next game.',
    rarity: 'EPIC' as const,
    effect: 'giant'
  },
  DOUBLE_MOVE: {
    name: 'Double Move',
    description: 'Play two moves in one turn.',
    rarity: 'COMMON' as const,
    effect: 'double_move'
  },
  BLOCK: {
    name: 'Block',
    description: 'Choose one cell and block it for the rest of the game.',
    rarity: 'COMMON' as const,
    effect: 'block'
  },
  SWAP_CELL: {
    name: 'Swap Cell',
    description: 'Swap one of your marks with one opponent mark.',
    rarity: 'RARE' as const,
    effect: 'swap_cell'
  },
  TIME_FREEZE: {
    name: 'Time Freeze',
    description: 'Freeze opponent\'s timer for 10 seconds.',
    rarity: 'RARE' as const,
    effect: 'time_freeze'
  },
  WILDCARD: {
    name: 'Wildcard',
    description: 'Place a mark that can count as X or O at the end of the game.',
    rarity: 'EPIC' as const,
    effect: 'wildcard'
  },
  SHIELD: {
    name: 'Shield',
    description: 'Protect your next move from being swapped or blocked.',
    rarity: 'COMMON' as const,
    effect: 'shield'
  },
  TELEPORT: {
    name: 'Teleport',
    description: 'Move one of your existing marks to any empty cell.',
    rarity: 'EPIC' as const,
    effect: 'teleport'
  },
  MIRROR: {
    name: 'Mirror',
    description: 'Copy the opponent\'s last move to a symmetric position.',
    rarity: 'LEGENDARY' as const,
    effect: 'mirror'
  },
  RESET: {
    name: 'Reset',
    description: 'Reset the board to its state 3 moves ago.',
    rarity: 'LEGENDARY' as const,
    effect: 'reset'
  }
}

// Helper functions
const checkWinner = (board: (string | null)[], size: number): string | null => {
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
}

const isBoardFull = (board: (string | null)[]): boolean => {
  return board.every(cell => cell !== null)
}

const createInitialCards = async () => {
  const cardTypes = Object.entries(CARD_TYPES)
  
  for (const [key, card] of cardTypes) {
    const existingCard = await prisma.card.findUnique({
      where: { name: card.name }
    })
    
    if (!existingCard) {
      await prisma.card.create({
        data: {
          name: card.name,
          description: card.description,
          type: key,
          rarity: card.rarity,
          effect: JSON.stringify({ effect: card.effect })
        }
      })
    }
  }
}

const getUserCards = async (userId: string): Promise<GameCard[]> => {
  const userCards = await prisma.userCard.findMany({
    where: { userId },
    include: { card: true }
  })
  
  return userCards.map(uc => ({
    id: uc.card.id,
    name: uc.card.name,
    description: uc.card.description,
    type: uc.card.type,
    rarity: uc.card.rarity,
    quantity: uc.quantity,
    used: uc.used
  }))
}

const awardCard = async (userId: string, cardType: string) => {
  const card = await prisma.card.findUnique({
    where: { type: cardType }
  })
  
  if (!card) return
  
  const existingUserCard = await prisma.userCard.findUnique({
    where: { userId_cardId: { userId, cardId: card.id } }
  })
  
  if (existingUserCard) {
    await prisma.userCard.update({
      where: { id: existingUserCard.id },
      data: { quantity: existingUserCard.quantity + 1 }
    })
  } else {
    await prisma.userCard.create({
      data: {
        userId,
        cardId: card.id,
        quantity: 1
      }
    })
  }
}

const useUserCard = async (userId: string, cardType: string) => {
  const card = await prisma.card.findUnique({
    where: { type: cardType }
  })
  
  if (!card) return false
  
  const userCard = await prisma.userCard.findUnique({
    where: { userId_cardId: { userId, cardId: card.id } }
  })
  
  if (!userCard || userCard.quantity <= 0) return false
  
  await prisma.userCard.update({
    where: { id: userCard.id },
    data: { 
      quantity: userCard.quantity - 1,
      used: userCard.used + 1
    }
  })
  
  return true
}

const updateUserStats = async (userId: string, result: 'win' | 'loss' | 'draw') => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })
  
  if (!user) return
  
  let newStreak = user.streak
  let newWins = user.wins
  let newLosses = user.losses
  let newDraws = user.draws
  
  if (result === 'win') {
    newWins = user.wins + 1
    newStreak = user.streak + 1
    
    // Award cards based on streak
    if (newStreak === 3) {
      await awardCard(userId, 'PROTECTION')
    } else if (newStreak === 5) {
      await awardCard(userId, 'GIANT')
    }
  } else if (result === 'loss') {
    newLosses = user.losses + 1
    newStreak = 0
  } else if (result === 'draw') {
    newDraws = user.draws + 1
    newStreak = 0
  }
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      streak: newStreak
    }
  })
}

const createGameRoom = (roomId: string, boardSize: number): GameRoom => {
  return {
    id: uuidv4(),
    roomId,
    boardSize,
    boardState: JSON.stringify(Array(boardSize * boardSize).fill(null)),
    currentTurn: '',
    status: 'WAITING',
    winner: null,
    players: [],
    blockedCells: [],
    moveHistory: []
  }
}

export const setupSocket = (io: Server) => {
  // Initialize cards in database
  createInitialCards()
  
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)
    
    // Create room
    socket.on('createRoom', async (data: { roomId: string; playerName: string; boardSize: number }) => {
      try {
        const { roomId, playerName, boardSize } = data
        
        // Create or get user
        let user = await prisma.user.findUnique({
          where: { email: `${socket.id}@temp.com` }
        })
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: socket.id,
              email: `${socket.id}@temp.com`,
              name: playerName
            }
          })
        } else {
          await prisma.user.update({
            where: { id: socket.id },
            data: { name: playerName }
          })
        }
        
        // Create game room
        const gameRoom = createGameRoom(roomId, boardSize)
        gameRooms.set(roomId, gameRoom)
        
        // Add player to room
        const player: Player = {
          id: socket.id,
          name: playerName,
          symbol: 'X',
          isCurrent: true,
          cards: await getUserCards(socket.id)
        }
        
        gameRoom.players.push(player)
        gameRoom.currentTurn = socket.id
        
        // Join socket room
        socket.join(roomId)
        
        // Send room created confirmation
        socket.emit('roomCreated', { roomId, playerId: socket.id })
        
        // Send game state to all players in room
        io.to(roomId).emit('gameStateUpdate', convertToGameState(gameRoom))
        
      } catch (error) {
        console.error('Error creating room:', error)
        socket.emit('error', { message: 'Failed to create room' })
      }
    })
    
    // Join room
    socket.on('joinRoom', async (data: { roomId: string; playerName: string }) => {
      try {
        const { roomId, playerName } = data
        
        const gameRoom = gameRooms.get(roomId)
        if (!gameRoom) {
          socket.emit('error', { message: 'Room not found' })
          return
        }
        
        if (gameRoom.players.length >= 2) {
          socket.emit('error', { message: 'Room is full' })
          return
        }
        
        // Create or get user
        let user = await prisma.user.findUnique({
          where: { email: `${socket.id}@temp.com` }
        })
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: socket.id,
              email: `${socket.id}@temp.com`,
              name: playerName
            }
          })
        } else {
          await prisma.user.update({
            where: { id: socket.id },
            data: { name: playerName }
          })
        }
        
        // Add player to room
        const player: Player = {
          id: socket.id,
          name: playerName,
          symbol: 'O',
          isCurrent: false,
          cards: await getUserCards(socket.id)
        }
        
        gameRoom.players.push(player)
        gameRoom.status = 'PLAYING'
        
        // Join socket room
        socket.join(roomId)
        
        // Send room joined confirmation
        socket.emit('roomJoined', { roomId, playerId: socket.id })
        
        // Notify all players
        io.to(roomId).emit('playerJoined', { players: gameRoom.players })
        io.to(roomId).emit('gameStateUpdate', convertToGameState(gameRoom))
        
      } catch (error) {
        console.error('Error joining room:', error)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })
    
    // Make move
    socket.on('makeMove', async (data: { roomId: string; position: number; cardType?: string }) => {
      try {
        const { roomId, position, cardType } = data
        const gameRoom = gameRooms.get(roomId)
        
        if (!gameRoom) {
          socket.emit('error', { message: 'Room not found' })
          return
        }
        
        if (gameRoom.status !== 'PLAYING') {
          socket.emit('error', { message: 'Game is not active' })
          return
        }
        
        if (gameRoom.currentTurn !== socket.id) {
          socket.emit('error', { message: 'Not your turn' })
          return
        }
        
        const board = JSON.parse(gameRoom.boardState)
        
        // Handle card effects
        if (cardType) {
          const cardUsed = await useUserCard(socket.id, cardType)
          if (!cardUsed) {
            socket.emit('error', { message: 'Card not available' })
            return
          }
          
          // Apply card effects
          switch (cardType) {
            case 'BLOCK':
              if (!gameRoom.blockedCells.includes(position)) {
                gameRoom.blockedCells.push(position)
              }
              io.to(roomId).emit('cardUsed', { cardName: CARD_TYPES[cardType as keyof typeof CARD_TYPES].name, playerId: socket.id })
              break
              
            case 'DOUBLE_MOVE':
              // Allow two moves, first move is normal
              io.to(roomId).emit('cardUsed', { cardName: CARD_TYPES[cardType as keyof typeof CARD_TYPES].name, playerId: socket.id })
              break
              
            case 'SWAP_CELL':
              // Find opponent's symbol
              const opponentSymbol = gameRoom.players.find(p => p.id !== socket.id)?.symbol
              if (opponentSymbol && board[position] === opponentSymbol) {
                // Find player's symbol to swap with
                const playerSymbol = gameRoom.players.find(p => p.id === socket.id)?.symbol
                if (playerSymbol) {
                  const playerPositions = board.map((cell, index) => cell === playerSymbol ? index : -1).filter(i => i !== -1)
                  if (playerPositions.length > 0) {
                    const swapPosition = playerPositions[0] // Swap with first player position
                    board[position] = playerSymbol
                    board[swapPosition] = opponentSymbol
                    gameRoom.boardState = JSON.stringify(board)
                    io.to(roomId).emit('cardUsed', { cardName: CARD_TYPES[cardType as keyof typeof CARD_TYPES].name, playerId: socket.id })
                  }
                }
              }
              break
              
            // Add more card effects as needed
          }
        }
        
        // Check if move is valid
        if (board[position] !== null || gameRoom.blockedCells.includes(position)) {
          socket.emit('error', { message: 'Invalid move' })
          return
        }
        
        // Make the move
        const currentPlayer = gameRoom.players.find(p => p.id === socket.id)
        if (!currentPlayer) return
        
        board[position] = currentPlayer.symbol
        gameRoom.boardState = JSON.stringify(board)
        
        // Add to move history
        gameRoom.moveHistory.push({
          position,
          symbol: currentPlayer.symbol,
          playerId: socket.id,
          timestamp: new Date()
        })
        
        // Check for winner
        const winner = checkWinner(board, gameRoom.boardSize)
        if (winner) {
          gameRoom.status = 'FINISHED'
          gameRoom.winner = winner
          
          // Update stats
          const winnerPlayer = gameRoom.players.find(p => p.symbol === winner)
          const loserPlayer = gameRoom.players.find(p => p.symbol !== winner)
          
          if (winnerPlayer) {
            await updateUserStats(winnerPlayer.id, 'win')
          }
          if (loserPlayer) {
            await updateUserStats(loserPlayer.id, 'loss')
          }
          
          // Get updated stats
          const winnerStats = winnerPlayer ? await prisma.user.findUnique({ where: { id: winnerPlayer.id } }) : null
          const loserStats = loserPlayer ? await prisma.user.findUnique({ where: { id: loserPlayer.id } }) : null
          
          io.to(roomId).emit('gameOver', { 
            winner, 
            stats: winnerPlayer ? { 
              wins: winnerStats?.wins || 0, 
              losses: winnerStats?.losses || 0, 
              draws: winnerStats?.draws || 0, 
              streak: winnerStats?.streak || 0 
            } : { wins: 0, losses: 0, draws: 0, streak: 0 }
          })
          
        } else if (isBoardFull(board)) {
          gameRoom.status = 'FINISHED'
          gameRoom.winner = null
          
          // Update stats for draw
          for (const player of gameRoom.players) {
            await updateUserStats(player.id, 'draw')
          }
          
          io.to(roomId).emit('gameOver', { winner: null, stats: { wins: 0, losses: 0, draws: 0, streak: 0 } })
        } else {
          // Switch turns
          const nextPlayer = gameRoom.players.find(p => p.id !== socket.id)
          if (nextPlayer) {
            gameRoom.currentTurn = nextPlayer.id
          }
        }
        
        // Update game state
        io.to(roomId).emit('gameStateUpdate', convertToGameState(gameRoom))
        
      } catch (error) {
        console.error('Error making move:', error)
        socket.emit('error', { message: 'Failed to make move' })
      }
    })
    
    // Get game state
    socket.on('getGameState', (data: { roomId: string }) => {
      const gameRoom = gameRooms.get(data.roomId)
      if (gameRoom) {
        socket.emit('gameStateUpdate', convertToGameState(gameRoom))
      }
    })
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
      
      // Find and clean up rooms with disconnected players
      for (const [roomId, gameRoom] of gameRooms.entries()) {
        const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id)
        if (playerIndex !== -1) {
          gameRoom.players.splice(playerIndex, 1)
          
          if (gameRoom.players.length === 0) {
            gameRooms.delete(roomId)
          } else {
            gameRoom.status = 'WAITING'
            io.to(roomId).emit('playerLeft', { playerId: socket.id })
            io.to(roomId).emit('gameStateUpdate', convertToGameState(gameRoom))
          }
          break
        }
      }
    })
  })
}

// Helper function to convert GameRoom to GameState
const convertToGameState = (gameRoom: GameRoom): GameState => {
  return {
    board: JSON.parse(gameRoom.boardState),
    currentPlayer: gameRoom.currentTurn,
    players: gameRoom.players,
    status: gameRoom.status,
    winner: gameRoom.winner,
    boardSize: gameRoom.boardSize,
    roomId: gameRoom.roomId,
    blockedCells: gameRoom.blockedCells,
    moveHistory: gameRoom.moveHistory
  }
}