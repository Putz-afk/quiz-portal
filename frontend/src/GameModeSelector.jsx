import React from 'react';
import { Zap, Brain, Gamepad2, Trophy } from 'lucide-react';

export default function GameModeSelector({ onSelectMode }) {
  const gameModes = [
    {
      id: 'trivia',
      name: 'Trivia Quiz',
      description: 'Answer questions on various topics and compete with others in real-time',
      icon: Brain,
      color: '#667eea'
    },
    {
      id: 'mode2',
      name: 'Coming Soon',
      description: 'More game modes coming soon!',
      icon: Gamepad2,
      color: '#764ba2',
      disabled: true
    },
    {
      id: 'mode3',
      name: 'Coming Soon',
      description: 'More game modes coming soon!',
      icon: Trophy,
      color: '#f093fb',
      disabled: true
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>
          <Zap size={40} /> QuizPortal
        </h1>
        <p style={styles.subtitle}>Choose a game mode to get started</p>

        <div style={styles.grid}>
          {gameModes.map(mode => {
            const IconComponent = mode.icon;
            return (
              <button
                key={mode.id}
                style={{
                  ...styles.modeCard,
                  opacity: mode.disabled ? 0.6 : 1,
                  cursor: mode.disabled ? 'not-allowed' : 'pointer',
                  borderColor: mode.color,
                  background: mode.disabled ? '#f5f5f5' : 'white'
                }}
                onClick={() => !mode.disabled && onSelectMode(mode.id)}
                disabled={mode.disabled}
              >
                <IconComponent size={48} color={mode.color} style={{ marginBottom: 12 }} />
                <h2 style={styles.modeName}>{mode.name}</h2>
                <p style={styles.modeDescription}>{mode.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'sans-serif',
    padding: 20,
    boxSizing: 'border-box'
  },
  card: {
    background: 'white',
    padding: '3rem',
    borderRadius: '16px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    width: '100%',
    maxWidth: '900px',
    textAlign: 'center',
    color: '#333'
  },
  title: {
    margin: '0 0 10px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: '#333',
    fontSize: '2.5rem'
  },
  subtitle: {
    margin: '0 0 30px 0',
    color: '#666',
    fontSize: '1.1rem'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: 20
  },
  modeCard: {
    padding: '30px 20px',
    borderRadius: '12px',
    border: '2px solid',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    transition: 'all 0.3s ease',
    outline: 'none',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
    }
  },
  modeName: {
    margin: '10px 0 5px 0',
    fontSize: '1.3rem',
    color: '#333',
    fontWeight: 'bold'
  },
  modeDescription: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#666',
    lineHeight: 1.4
  }
};
