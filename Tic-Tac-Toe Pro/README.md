# Tic-Tac-Toe Pro

A modern, feature-rich Tic-Tac-Toe game with multiplayer support, power-up cards, and beautiful animations.

## Features

### Core Gameplay
- **Multiple Board Sizes**: Play on 3×3, 4×4, or 5×5 grids
- **Real-time Multiplayer**: Create rooms and play with friends via invite links
- **Smooth Animations**: Beautiful transitions and visual feedback using Framer Motion
- **Responsive Design**: Works perfectly on mobile and desktop devices

### Card System
Collect and use powerful cards to gain advantages in the game:

#### Required Cards
1. **Protection Card** (🛡️) - Rare
   - Awarded after 3 consecutive wins
   - If you lose the next game, it counts as a draw instead
   - Consumed after use

2. **Giant Card** (🦍) - Epic
   - Awarded after 5 consecutive wins
   - At the start of the next game, place two marks immediately
   - Consumed after use

#### Additional Cards
3. **Double Move** (⚡) - Common
   - Play two moves in one turn

4. **Block** (🚫) - Common
   - Choose one cell and block it for the rest of the game

5. **Swap Cell** (🔄) - Rare
   - Swap one of your marks with one opponent mark

6. **Time Freeze** (❄️) - Rare
   - Freeze opponent's timer for 10 seconds (timed mode)

7. **Wildcard** (🃏) - Epic
   - Place a mark that can count as X or O at the end of the game

8. **Shield** (🛡️) - Common
   - Protect your next move from being swapped or blocked

9. **Teleport** (🌀) - Epic
   - Move one of your existing marks to any empty cell

10. **Mirror** (🪞) - Legendary
    - Copy the opponent's last move to a symmetric position

11. **Reset** (🔄) - Legendary
    - Reset the board to its state 3 moves ago

### Game Features
- **Streak System**: Track consecutive wins and earn special cards
- **Statistics**: Monitor wins, losses, draws, and current streak
- **Real-time Sync**: All game actions are synchronized instantly
- **Server Validation**: Prevents cheating with authoritative server logic
- **Reconnect Support**: Rejoin games if disconnected

## Technology Stack

### Frontend
- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** for beautiful UI components
- **Framer Motion** for smooth animations
- **Socket.io Client** for real-time communication
- **Zustand** for state management

### Backend
- **Node.js** with Express
- **Socket.io** for WebSocket connections
- **Prisma** ORM with SQLite database
- **TypeScript** for type safety

### Development Tools
- **ESLint** for code quality
- **Prettier** for code formatting
- **Nodemon** for development server

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tic-tac-toe-pro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   npm run db:push
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

### Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

## How to Play

### Starting a Game
1. Enter your name in the "Game Controls" panel
2. Click "Create Room" to generate a new game room
3. Share the Room ID with your friend
4. Your friend can join using the "Join Room" tab

### Gameplay
- Players take turns placing X and O marks on the board
- First player to get a complete row, column, or diagonal wins
- Use cards strategically to gain advantages
- Cards are earned through win streaks

### Using Cards
1. Click on a card in your card rack to activate it
2. The card effect will be highlighted on the board
3. Make your move within 5 seconds to apply the card effect
4. Cards are consumed after use

## Card Balance and Strategy

### Card Rarity System
- **Common** (White): Basic utility cards
- **Rare** (Blue): Strategic cards with significant impact
- **Epic** (Purple): Game-changing cards
- **Legendary** (Red): Extremely powerful, rare cards

### Strategic Tips
- Save Protection cards for important games
- Use Giant cards to control the board early
- Block cards are great for preventing opponent wins
- Swap cards can turn losing positions into winning ones
- Time Freeze is most effective in timed games

## API Reference

### Socket Events

#### Client to Server
- `createRoom` - Create a new game room
- `joinRoom` - Join an existing room
- `makeMove` - Make a move on the board
- `getGameState` - Request current game state

#### Server to Client
- `gameStateUpdate` - Updated game state
- `playerJoined` - New player joined notification
- `gameOver` - Game finished with winner
- `cardUsed` - Card usage notification
- `error` - Error messages

### Database Schema

The application uses Prisma with SQLite and includes the following models:
- `User` - Player information and statistics
- `GameRoom` - Game session data
- `GamePlayer` - Player participation in games
- `GameMove` - Individual move records
- `Card` - Card definitions
- `UserCard` - Player's card inventory

## Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Setup for Production
1. Set up a proper database (PostgreSQL recommended)
2. Configure environment variables
3. Set up reverse proxy if needed
4. Ensure proper CORS settings for Socket.io

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines
- Follow TypeScript best practices
- Use ESLint and Prettier
- Write clear, documented code
- Test thoroughly before submitting

## Testing

### Running Tests
```bash
npm test
```

### Test Coverage
- Game logic validation
- Socket event handling
- Card effect implementation
- Database operations

## Troubleshooting

### Common Issues

**Connection Issues**
- Ensure Socket.io server is running on port 3001
- Check CORS settings
- Verify firewall settings

**Database Issues**
- Run `npm run db:push` to update schema
- Check database file permissions
- Verify environment variables

**Build Issues**
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check TypeScript errors

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

## Future Enhancements

Planned features for future releases:
- Tournament mode
- Spectator mode
- More card types
- Achievements system
- Player profiles and avatars
- Game replay system
- Mobile app version