import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Users, Zap, AlertCircle, CheckCircle, XCircle, ArrowRight, WifiOff, Crown, Medal, RefreshCw, Copy } from 'lucide-react';

// --- CONFIGURATION ---

// 1. PUBLIC TUNNEL (NGROK):
// Paste your Ngrok URL here. It changes every time you restart Ngrok!
// IMPORTANT: Do NOT include the trailing slash '/'.
// Example: "https://a1b2-c3d4.ngrok-free.app"
const API_URL = "https://lady-unexcogitative-supremely.ngrok-free.dev";

// Handle WebSocket URL protocol (ws:// vs wss://) automatically
// Note: Ngrok uses wss (secure), so we replace http with wss
const WS_URL = API_URL.replace(/^http/, 'ws') + "/ws";

export default function App() {
  useEffect(() => {
    document.title = 'QuizPortal';
  }, []);

  const [view, setView] = useState('login'); 
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [gameState, setGameState] = useState('WAITING'); 
  
  // Copy Button State
  const [copied, setCopied] = useState(false);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [totalQ, setTotalQ] = useState(0);
  
  // Game State Logic
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revealResult, setRevealResult] = useState(null); 
  const [myScore, setMyScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [submittedAnswer, setSubmittedAnswer] = useState(null); // Track submitted answer for reveal 

  const socketRef = useRef(null);

  const createRoom = async () => {
    if (!playerName) return setError("Please enter your name");
    try {
      const res = await fetch(`${API_URL}/create-room`, { method: 'POST' });
      const data = await res.json();
      setRoomCode(data.room_code);
      connectToGame(data.room_code, playerName);
    } catch (err) {
      console.error(err);
      setError("Could not reach the server. Is the backend running?");
    }
  };

  const joinRoom = async () => {
    if (!playerName || !roomCode) return setError("Enter name and code");
    try {
      const res = await fetch(`${API_URL}/check-room/${roomCode}`);
      if (!res.ok) throw new Error("Room not found");
      connectToGame(roomCode, playerName);
    } catch (err) {
      console.error(err);
      setError("Room not found or server offline");
    }
  };

  const connectToGame = (code, name) => {
    const ws = new WebSocket(`${WS_URL}/${code}/${name}`);
    
    ws.onopen = () => {
      console.log("Connected to game server");
      setView('lobby');
      setError('');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    };

    ws.onclose = () => {
      setError("Disconnected from server");
      setView('login');
    };

    socketRef.current = ws;
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case 'PLAYER_UPDATE':
        setPlayers(data.players);
        updateMyStatus(data.players);
        break;

      case 'STATUS_UPDATE':
        setGameState(data.state);
        if (data.state === 'WAITING') {
           setView('lobby');
           setRevealResult(null);
           setHasSubmitted(false);
        }
        break;

      case 'NEW_QUESTION':
        setView('game');
        setGameState('PLAYING');
        setCurrentQuestion(data.question);
        setQIndex(data.index + 1);
        setTotalQ(data.total);
        
        // Reset per-question state
        setHasSubmitted(false);
        setRevealResult(null);
        setSelectedOption(null);
        setSubmittedAnswer(null);
        break;

      case 'ANSWER_ACK':
        setHasSubmitted(true);
        // Don't reveal result yet - wait for ROUND_REVEAL when all players answered
        break;

      case 'ROUND_REVEAL':
        setGameState('REVEAL');
        setPlayers(data.players);
        updateMyStatus(data.players);
        
        // --- SECURITY UPDATE: Merge the answer key into the question ---
        setCurrentQuestion(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                correct_index: data.correct_index,
                explanation: data.explanation
            };
        });
        
        // Now calculate if player's answer was correct using the stored submitted answer
        setRevealResult({ correct: submittedAnswer === data.correct_index });
        break;
        
      case 'GAME_OVER':
        setGameState('FINISHED');
        setView('result');
        setPlayers(data.players);
        break;
        
      default:
        console.log("Unknown message:", data);
    }
  };

  const updateMyStatus = (playerList) => {
    const me = playerList.find(p => p.name === playerName);
    if (me) {
      setMyScore(me.score);
      setIsHost(me.is_host);
    }
  };

  const startGame = (topic) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      action: "START_GAME",
      payload: { topic: topic, mode: "topic" }
    }));
  };

  const submitAnswer = (index) => {
    if (hasSubmitted) return; 
    setSelectedOption(index);
    setSubmittedAnswer(index); // Store for reveal
    socketRef.current.send(JSON.stringify({
      action: "SUBMIT_ANSWER",
      payload: { index }
    }));
  };

  const nextQuestion = () => {
    socketRef.current.send(JSON.stringify({
      action: "NEXT_QUESTION",
      payload: {}
    }));
  };
  
  const resetLobby = () => {
    socketRef.current.send(JSON.stringify({
      action: "RESET_LOBBY",
      payload: {}
    }));
  };

  const copyRoomCode = () => {
    // Fallback copy method for iframes/older browsers
    const textArea = document.createElement("textarea");
    textArea.value = roomCode;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Render Helpers ---

  const renderPlayerStrip = () => (
    <div style={styles.playerStrip}>
      {players.map(p => (
        <div key={p.id} style={{
           ...styles.playerChip, 
           opacity: p.is_connected ? 1 : 0.5 
        }}>
          {p.is_host && <Crown size={12} color="gold" style={{marginRight:4}} />}
          <span style={{marginRight: 4}}>{p.name}</span>
          
          {!p.is_connected && <WifiOff size={14} color="red" />}
          {p.is_connected && p.has_answered && <CheckCircle size={14} color="#10b981" />}
          {p.is_connected && !p.has_answered && <div style={styles.dot} />}
        </div>
      ))}
    </div>
  );

  const getFeedbackColor = () => {
    if (!revealResult) return "bg-white border-gray-200";
    if (revealResult.correct === true) return "bg-green-100 border-green-500 text-green-700";
    if (revealResult.correct === false) return "bg-red-100 border-red-500 text-red-700";
    return "bg-white border-gray-200";
  };

  // --- Views ---

  if (view === 'login') {
    return (
      <div style={styles.container} className="quiz-app-root">
        <div style={styles.card} className="quiz-card">
          <h1 style={styles.title}><Zap size={32} /> QuizPortal</h1>
          <p style={styles.subtitle}>Enter your name to start</p>
          <input 
            style={styles.input} 
            placeholder="Your Name" 
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
          <div style={styles.row}>
            <button style={styles.primaryBtn} onClick={createRoom}>Host Game</button>
            <div style={{width: 10}}></div>
            <div style={styles.col}>
              <input 
                style={styles.smallInput} 
                placeholder="Code" 
                value={roomCode} 
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
              />
              <button style={styles.secondaryBtn} onClick={joinRoom}>Join</button>
            </div>
          </div>
          {error && <p style={styles.error}><AlertCircle size={16}/> {error}</p>}
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <div style={styles.container} className="quiz-app-root"> 
        <div style={styles.card} className="quiz-card">
          <div style={styles.header}>
            <h2 style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '0 0 10px 0', color: '#333'}}>
              Room: {roomCode}
              <button onClick={copyRoomCode} style={styles.copyBtn} title="Copy Code">
                {copied ? <CheckCircle size={22} color="#10b981" /> : <Copy size={22} color="#666" />}
              </button>
            </h2>
            <span style={styles.badge}>{players.length} Players</span>
          </div>
          
          <div style={styles.playerList}>
            {players.map(p => (
              <div key={p.id} style={styles.playerRow}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <Users size={20} /> 
                  {p.name} 
                  {p.is_host && <Crown size={16} color="gold"/>}
                </div>
                {!p.is_connected && <span style={styles.offlineTag}>Offline</span>}
              </div>
            ))}
          </div>

          <div style={styles.divider}></div>
          {gameState === 'GENERATING' ? (
             <div style={styles.loading}>
               <div style={styles.spinner}></div>
               <p>Consulting the Oracle...</p>
             </div>
          ) : isHost ? (
            <div>
              <p style={styles.label}>Choose a Topic:</p>
              <form onSubmit={(e) => { e.preventDefault(); startGame(e.target.topic.value); }}>
                <input name="topic" style={styles.input} placeholder="e.g. History of Makassar" />
                <button type="submit" style={styles.actionBtn}>Start Game</button>
              </form>
            </div>
          ) : (
            <p style={styles.waitingText}>Waiting for host to start...</p>
          )}
        </div>
      </div>
    );
  }

  if (view === 'game') {
    return (
      <div style={styles.container} className="quiz-app-root">
        <div style={styles.gameCard} className="quiz-game-card">
          {renderPlayerStrip()}
          
          <div style={styles.gameHeader}>
            <span>Q{qIndex}/{totalQ}</span>
            <span style={styles.scoreBadge}>Score: {myScore}</span>
          </div>
          
          {currentQuestion && (
            <>
              <h3 style={styles.question}>{currentQuestion.question}</h3>
              <div style={styles.grid}>
                {currentQuestion.options.map((opt, idx) => {
                  let btnStyle = { ...styles.optionBtn };
                  
                  // Visual Logic
                  if (gameState === 'REVEAL') {
                     // REVEAL PHASE: Show Truth
                     if (idx === currentQuestion.correct_index) {
                        btnStyle = { ...btnStyle, ...styles.correctBtn };
                     } else if (idx === selectedOption && idx !== currentQuestion.correct_index) {
                        btnStyle = { ...btnStyle, ...styles.wrongBtn };
                     } else {
                        btnStyle = { ...btnStyle, ...styles.dimmedBtn };
                     }
                  } else if (hasSubmitted) {
                     // WAITING PHASE: Show what I selected, dim others
                     if (idx === selectedOption) {
                        btnStyle = { ...btnStyle, border: '2px solid #667eea', background: '#e0e7ff' };
                     } else {
                        btnStyle = { ...btnStyle, opacity: 0.5 };
                     }
                  }
                  
                  return (
                    <button 
                      key={idx} 
                      style={btnStyle}
                      onClick={() => submitAnswer(idx)}
                      disabled={hasSubmitted} // Lock input after submit
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Logic for Bottom Area */}
          <div style={{marginTop: 20, textAlign: 'center', minHeight: 60}}>
             {gameState === 'PLAYING' && hasSubmitted && (
                 <p style={styles.waitingPulse}>Waiting for other players...</p>
             )}

             {gameState === 'REVEAL' && revealResult && (
                <>
                   <div className={getFeedbackColor()} style={styles.feedback}>
                     {revealResult.correct ? <CheckCircle /> : <XCircle />}
                     <span style={{marginLeft: 10}}>
                       {revealResult.correct ? "Correct!" : "Wrong!"}
                     </span>
                   </div>
                   
                   {isHost ? (
                     <button style={styles.nextBtn} onClick={nextQuestion}>
                       Next Question <ArrowRight size={18} />
                     </button>
                   ) : (
                     <p>Waiting for host...</p>
                   )}
                </>
             )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'result') {
    // Sort players by score
    const sortedPlayers = [...players].sort((a,b) => b.score - a.score);
    const top3 = sortedPlayers.slice(0, 3);
    const rest = sortedPlayers.slice(3);

    return (
      <div style={styles.container} className="quiz-app-root">
        <div style={styles.card} className="quiz-card">
          <h1 style={styles.title}><Trophy size={32} color="gold" /> Final Results</h1>
          
          {/* PODIUM */}
          <div style={styles.podiumContainer}>
            {top3[1] && (
               <div style={{...styles.podiumBar, height: 100, background: '#C0C0C0'}}>
                 <div style={styles.avatar}>{top3[1].name[0]}</div>
                 <span>{top3[1].name}</span>
                 <span style={{fontWeight:'900'}}>{top3[1].score}</span>
               </div>
            )}
            
            {top3[0] && (
               <div style={{...styles.podiumBar, height: 140, background: '#FFD700', zIndex: 2, boxShadow: '0 5px 15px rgba(0,0,0,0.1)'}}>
                 <Crown size={24} color="white" style={{marginBottom: 5}}/>
                 <div style={styles.avatar}>{top3[0].name[0]}</div>
                 <span>{top3[0].name}</span>
                 <span style={{fontWeight:'900', fontSize: 20}}>{top3[0].score}</span>
               </div>
            )}

            {top3[2] && (
               <div style={{...styles.podiumBar, height: 80, background: '#CD7F32'}}>
                 <div style={styles.avatar}>{top3[2].name[0]}</div>
                 <span>{top3[2].name}</span>
                 <span style={{fontWeight:'900'}}>{top3[2].score}</span>
               </div>
            )}
          </div>

          {/* LIST FOR OTHERS */}
          {rest.length > 0 && (
            <div style={styles.leaderboard}>
              {rest.map((p, idx) => (
                <div key={p.id} style={styles.scoreRow}>
                  <span style={styles.rank}>#{idx+4}</span>
                  <span style={styles.name}>{p.name}</span>
                  <span style={styles.points}>{p.score} pts</span>
                </div>
              ))}
            </div>
          )}
          
          <div style={styles.divider}></div>
          
          {isHost ? (
             <button style={styles.actionBtn} onClick={resetLobby}>
                <RefreshCw size={18} style={{marginRight:8}}/> Play Again (Same Room)
             </button>
          ) : (
             <p style={styles.waitingPulse}>Waiting for host to restart...</p>
          )}

          <button style={{...styles.secondaryBtn, marginTop: 10}} onClick={() => window.location.reload()}>
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  return null;
}

const styles = {
  container: {
    // FIX: Using fixed positioning to force full viewport coverage
    // This overrides any default margins or flex behaviors from Vite's index.css
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    overflowY: 'auto', // Allow scrolling on smaller screens
    
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
    fontFamily: 'sans-serif', 
    padding: 20,
    boxSizing: 'border-box' 
  },
  card: {
    background: 'white', padding: '2rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    width: '100%', maxWidth: '400px', textAlign: 'center', color: '#333'
  },
  gameCard: {
    background: 'white', padding: '2rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    width: '100%', maxWidth: '600px',
    textAlign: 'center' 
  },
  title: { margin: '0 0 10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#333' },
  subtitle: { margin: '0 0 20px 0', color: '#666' },
  waitingText: { 
    color: '#333', 
    fontSize: '16px', 
    marginTop: 20, 
    fontStyle: 'italic' 
  },
  input: { background: '#fff', color: '#333', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px', fontSize: '16px', boxSizing: 'border-box' },
  smallInput: { background: '#fff', color: '#333', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '5px', fontSize: '14px', textTransform: 'uppercase', boxSizing: 'border-box' },
  row: { display: 'flex', gap: '10px', marginTop: 10 },
  col: { display: 'flex', flexDirection: 'column', flex: 1 },
  primaryBtn: { flex: 1, background: '#667eea', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
  secondaryBtn: { background: '#f3f4f6', color: '#333', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', width: '100%' },
  actionBtn: { width: '100%', background: '#764ba2', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nextBtn: { background: '#333', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '20px', cursor: 'pointer', marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 },
  copyBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: '50%', transition: 'background 0.2s', },
  error: { color: 'red', fontSize: '14px', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', marginTop: 10 },
  playerList: { textAlign: 'left', marginTop: 20, marginBottom: 20 },
  playerRow: { color: '#333', padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  offlineTag: { fontSize: 12, color: 'red', fontWeight: 'bold' },
  spinner: { width: 24, height: 24, border: '3px solid #f3f3f3', borderTop: '3px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' },
  gameHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 20, color: '#888', fontWeight: 'bold' },
  scoreBadge: { background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: '4px' },
  question: { fontSize: '1.25rem', marginBottom: '20px', color: '#1f2937', lineHeight: 1.4 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  
  optionBtn: { 
    padding: '15px', 
    borderRadius: '12px', 
    border: '2px solid #e5e7eb', 
    background: 'white', 
    cursor: 'pointer', 
    fontSize: '16px', 
    transition: 'all 0.2s', 
    color: '#333',
    outline: 'none' 
  },
  correctBtn: { 
    background: '#dcfce7', 
    border: '2px solid #22c55e', 
    color: '#166534' 
  },
  wrongBtn: { 
    background: '#fee2e2', 
    border: '2px solid #ef4444', 
    color: '#991b1b' 
  },
  dimmedBtn: { 
    opacity: 0.6, 
    background: '#f9fafb',
    border: '2px solid #e5e7eb', 
    color: '#9ca3af'
  },
  feedback: { padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '1px solid' },
  waitingPulse: { color: '#667eea', fontWeight: 'bold', animation: 'pulse 1.5s infinite' },
  
  playerStrip: { display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 5 },
  playerChip: { 
    background: '#f3f4f6', borderRadius: 20, padding: '4px 10px', fontSize: 12, 
    display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', whiteSpace: 'nowrap'
  },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#ccc' },
  
  // Podium Styles
  podiumContainer: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginBottom: 30, marginTop: 20, height: 160 },
  podiumBar: { width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', borderRadius: '8px 8px 0 0', padding: 10, color: '#333', fontWeight: 'bold', position: 'relative' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 5 },
  
  leaderboard: { marginTop: 10, textAlign: 'left', maxHeight: 200, overflowY: 'auto' },
  scoreRow: { display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f9fafb', marginBottom: 5, borderRadius: 8 },
  rank: { fontWeight: 'bold', width: 30 },
  points: { fontWeight: 'bold', color: '#764ba2' },
  divider: { height: 1, background: '#eee', margin: '20px 0' }
};