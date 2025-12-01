import React, { useState } from 'react';
import GameModeSelector from './GameModeSelector';
import TriviaGame from './TriviaGame';

export default function App() {
  const [currentMode, setCurrentMode] = useState(null); // null = menu, 'trivia' = trivia game

  const handleSelectMode = (mode) => {
    setCurrentMode(mode);
  };

  const handleBackToMenu = () => {
    setCurrentMode(null);
  };

  // Show home/menu screen if no mode selected
  if (!currentMode) {
    return <GameModeSelector onSelectMode={handleSelectMode} />;
  }

  // Show Trivia Game
  if (currentMode === 'trivia') {
    return <TriviaGame onBackToMenu={handleBackToMenu} />;
  }

  return null;
}
