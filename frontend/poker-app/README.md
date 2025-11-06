# Texas Hold'em Poker Simulator

This is a single-page application built with Next.js that simulates a game of Texas Hold'em poker.

## ✨ Key Features

*   **Interactive Poker Table**: A visual representation of a 6-player poker game.
*   **Full Game Logic**: Implements the rules of Texas Hold'em, including betting rounds (pre-flop, flop, turn, river), blinds, and showdowns.
*   **Player Controls**: Fold, check, call, bet, and raise with an intuitive UI.
*   **Live Action Log**: Follow the play-by-play of every hand in real-time.
*   **Persistent Hand History**: All hands are saved and can be reviewed in detail. The history is stored in memory via a simple API route for this demo.
*   **Winnings Calculation**: Correctly handles main pots, side pots, and all-in scenarios.
*   **Stack Management**: Player stacks are persisted between hands. You can reset stacks before starting a new hand.

## 🚀 Getting Started

### Running the Application

To run the development server:

```bash
npm run dev
```

This will start the application, and you can view it in your browser, typically at `http://localhost:3000`.

### Running Tests

The project is set up with Jest for unit testing the core poker logic. To run the tests:

```bash
npm run test
```

This will execute the test files in watch mode, automatically re-running tests when you save a file.

## 🛠️ Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/) (with App Router)
*   **UI**: [React](https://reactjs.org/) & [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **UI Components**: [ShadCN UI](https://ui.shadcn.com/)
*   **Testing**: [Jest](https://jestjs.io/) & [React Testing Library](https://testing-library.com/)