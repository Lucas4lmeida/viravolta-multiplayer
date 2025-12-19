import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, update, get, remove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyACmxWbxC8ghcbd2LAvX3ytdfNwv8",
  authDomain: "viravolta-game.firebaseapp.com",
  databaseURL: "https://viravolta-game-default-rtdb.firebaseio.com",
  projectId: "viravolta-game",
  storageBucket: "viravolta-game.firebasestorage.app",
  messagingSenderId: "782716865934",
  appId: "1:782716865934:web:ec4f131b6b53a488a6e8df"
};

let app, database;
try {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
} catch (error) {
  console.log("Firebase erro/demo");
}

// --- DADOS E CONSTANTES ---
const HAND_SIGNS = {
  0: '✊', 1: '👍', 2: '✌️', 3: '🤟', 4: '🖖', 5: '🖐️',
  6: '🤙', 7: '👉', 8: '✊', 9: '👇', 10: '👆✊',
  11: '👍👍', 12: '👍✌️', 13: '👍🤟', 14: '👍🖖',
  15: '👍🖐️', 16: '👍🤙', 17: '👍👉', 18: '👍✊',
  19: '👍👇', 20: '✌️✊'
};

const AVATARS = ['🐊', '🐸', '🐢', '🦎', '🐲', '🦖'];

const COLORS = {
  red: '#ff4757',      // Vermelho (PAR)
  green: '#2ed573',    // Verde (ÍMPAR)
  black: '#2f3542',    // Preto (Especial)
  blue: '#1e90ff',     
  gold: '#ffa502',
  bg: '#218c74',       // Fundo Verde Jacaré
  cardBack: '#2c3e50'
};

const TURN_TIME = 45; // Tempo um pouco maior para pensar na matemática + cor

// --- FUNÇÃO PARA OBTER CAMINHO DA IMAGEM DA CARTA ---
const getCardImagePath = (card, isBack = false) => {
  if (isBack) {
    return '/cards/back.png';
  }
  
  if (card.type === 'number') {
    return `/cards/${card.value}_${card.color}.png`;
  }
  
  if (card.type === 'wild') {
    return '/cards/wild.png';
  }
  
  if (card.type === 'reverse_wild') {
    return '/cards/reverse.png';
  }
  
  if (card.type === 'action') {
    if (card.value === '+2') return '/cards/plus2.png';
    if (card.value === '+4') return '/cards/plus4.png';
  }

  return '/cards/back.png';
};

// --- COMPONENTE PRINCIPAL ---
const ViraVoltaMultiplayer = () => {
  const [screen, setScreen] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [message, setMessage] = useState('');
  const [rolling, setRolling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TURN_TIME);
  const [hostId, setHostId] = useState(null);
  
  // Modais
  const [showColorModal, setShowColorModal] = useState(false);
  const [pendingCardIndex, setPendingCardIndex] = useState(null);
  const [errorModal, setErrorModal] = useState(null); // { title, message }

  useEffect(() => {
    if (!playerId) setPlayerId('player_' + Math.random().toString(36).substr(2, 9));
  }, []);

  // Listener Firebase
  useEffect(() => {
    if (room && database) {
      const roomRef = ref(database, `rooms/${room}`);
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setHostId(data.host);
          const pList = Object.values(data.players || {});
          setPlayers(pList);
          setGameState(data.gameState || null);
          
          if (data.players[playerId]) setMyHand(data.players[playerId].hand || []);
          
          if (data.gameState?.started && !data.gameState?.ended && screen === 'lobby') setScreen('game');
          if (data.gameState?.ended && screen === 'game') setScreen('gameOver');
          if (!data.gameState && (screen === 'game' || screen === 'gameOver')) {
            setScreen('lobby');
            setMessage('');
          }
        } else {
          setScreen('menu');
        }
      });
      return () => unsubscribe();
    }
  }, [room, playerId, screen]);

  // Timer
  useEffect(() => {
    if (gameState?.started && !gameState?.ended) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
        const remaining = Math.max(0, TURN_TIME - elapsed);
        setTimeLeft(remaining);
        
        // Se tempo acabou, compra automática
        if (remaining <= 0 && gameState.currentPlayerId === playerId && !showColorModal) {
          drawCard(); 
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, playerId, showColorModal]);

  // --- BARALHO E INÍCIO ---

  const createDeck = () => {
    const newDeck = [];
    // Cartas Numéricas 0-20 (Manual: Vermelhas=Par, Verdes=Ímpar)
    for (let i = 0; i <= 20; i++) {
      const color = i % 2 === 0 ? 'red' : 'green'; 
      const card = { 
        id: `num_${i}_${Math.random()}`, 
        value: i, 
        type: 'number', 
        color, 
        symbol: HAND_SIGNS[i],
        label: i % 2 === 0 ? 'PAR' : 'ÍMPAR'
      };
      // 2 cópias de cada
      newDeck.push(card);
      newDeck.push({...card, id: `n_${i}_2_${Math.random()}`});
    }
    // Coringas (Troca Cor) - 12 cartas
    for (let i = 0; i < 12; i++) {
      newDeck.push({ id: `wild_${i}`, value: '★', type: 'wild', color: 'black', symbol: '🎭', label: 'CORINGA' });
    }
    // Reverse (Inverte + Troca Cor) - 6 cartas
    for (let i = 0; i < 6; i++) {
      newDeck.push({ id: `rev_${i}`, value: '⇄', type: 'reverse_wild', color: 'black', symbol: '⇄', label: 'INVERTER' });
    }
    // Ação (+2, +4) - 6 de cada
    ['+2', '+4'].forEach(act => {
      for (let i = 0; i < 6; i++) {
        newDeck.push({ id: `act_${act}_${i}_${Math.random()}`, value: act, type: 'action', color: 'black', symbol: act, label: 'ATAQUE' });
      }
    });
    return shuffle(newDeck);
  };

  const shuffle = (array) => {
    const s = [...array];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s;
  };

  const createRoom = async () => {
    if (!playerName.trim()) return showError('Ops!', 'Digite seu nome para criar uma sala.');
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    if (database) {
      await set(ref(database, `rooms/${code}`), {
        host: playerId,
        players: { [playerId]: { id: playerId, name: playerName, hand: [], ready: false, avatar: AVATARS[0], joinOrder: 0 } },
        createdAt: Date.now()
      });
    }
    setRoomCode(code);
    setRoom(code);
    setScreen('lobby');
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) return showError('Ops!', 'Digite seu nome e o código da sala.');
    const rRef = ref(database, `rooms/${roomCode.toUpperCase()}`);
    const snap = await get(rRef);
    if (snap.exists()) {
      const count = Object.keys(snap.val().players || {}).length;
      if (count >= 4) return showError('Sala Cheia!', 'Esta sala já tem 4 jogadores.');
      await update(ref(database, `rooms/${roomCode.toUpperCase()}/players/${playerId}`), {
        id: playerId, name: playerName, hand: [], ready: false, avatar: AVATARS[count % AVATARS.length], joinOrder: count
      });
      setRoom(roomCode.toUpperCase());
      setScreen('lobby');
    } else {
      showError('Sala não encontrada!', 'Verifique o código e tente novamente.');
    }
  };

  const toggleReady = async () => {
    const pRef = ref(database, `rooms/${room}/players/${playerId}`);
    const s = await get(pRef);
    await update(pRef, { ready: !s.val().ready });
  };

  const startGame = async () => {
    const rRef = ref(database, `rooms/${room}`);
    const s = await get(rRef);
    const d = s.val();
    const pList = Object.values(d.players || {});
    
    if (pList.length < 2 || !pList.every(p => p.ready)) return showError('Aguarde!', 'Todos os jogadores precisam estar prontos (mínimo 2).');

    const deck = createDeck();
    const hands = {};
    
    // Regra da Maior Carta (Sorteio interno)
    let highestVal = -1;
    let starterIndex = 0;

    pList.forEach((p, index) => {
      hands[p.id] = [];
      for(let i=0; i<5; i++) hands[p.id].push(deck.pop()); 
      
      const sortVal = Math.floor(Math.random() * 100);
      if (sortVal > highestVal) {
        highestVal = sortVal;
        starterIndex = index;
      }
    });

    let first = deck.pop();
    while(first.type !== 'number') { deck.unshift(first); first = deck.pop(); }

    pList.forEach(p => update(ref(database, `rooms/${room}/players/${p.id}`), { hand: hands[p.id] }));

    await update(rRef, {
      gameState: {
        deck, discardPile: [first],
        lastNumericValue: first.value,
        activeColor: first.color,
        currentPlayerIndex: starterIndex,
        currentPlayerId: pList[starterIndex].id,
        direction: 1, 
        playerOrder: pList.map(p=>p.id),
        started: true, ended: false, turnStartTime: Date.now(),
        mustDraw: 0, 
        diceResult: null 
      }
    });
  };

  // --- LÓGICA DO JOGO ---

  const rollDice = async () => {
    if (gameState.currentPlayerId !== playerId || gameState.diceResult) return;
    setRolling(true);
    
    setTimeout(async () => {
      // Probabilidade: 45% Maior, 45% Menor, 10% Igual
      const rand = Math.random();
      let res = '>';
      if (rand < 0.45) res = '>';
      else if (rand < 0.90) res = '<';
      else res = '=';

      await update(ref(database, `rooms/${room}/gameState`), { diceResult: res });
      setRolling(false);
      showToast(`Dado: ${res}`);
    }, 600);
  };

  // Lógica Central: Cor + Matemática
  const canPlayCard = (card) => {
    if (!gameState) return false;
    
    // 1. Defesa (+2/+4)
    if (gameState.mustDraw > 0) return card.type === 'action';
    
    // 2. Carta Preta (Coringas salvam do travamento matemático)
    if (card.color === 'black') return true;

    // 3. REGRA DE COR (PAR/IMPAR)
    // O manual diz: "respeitar o símbolo do dado E TAMBÉM a cor"
    // Então, se a mesa é VERMELHA, só posso jogar VERMELHA.
    if (card.color !== gameState.activeColor) return false;

    // 4. SE NÃO TEM VALOR ALVO (Coringa/Reverse na mesa), qualquer carta da cor certa vale
    // Não precisa rolar dado nesse caso!
    if (gameState.lastNumericValue === -1) return true;

    // 5. Verifica se rolou o dado (só quando tem alvo numérico)
    if (!gameState.diceResult) return false;

    // 6. REGRA MATEMÁTICA
    const tableValue = gameState.lastNumericValue;
    const cardValue = card.value;
    const op = gameState.diceResult;

    if (op === '>') return cardValue > tableValue;
    if (op === '<') return cardValue < tableValue;
    if (op === '=') return cardValue === tableValue;

    return false;
  };

  const handleCardClick = (index) => {
    if (gameState.currentPlayerId !== playerId) return;
    const card = myHand[index];
    
    // Feedback de erro - só exige dado quando tem alvo numérico
    if (card.type === 'number' && !gameState.diceResult && gameState.mustDraw === 0 && gameState.lastNumericValue !== -1) {
      showToast('🎲 Jogue o dado primeiro!');
      return;
    }
    
    if (card.type === 'number' && gameState.lastNumericValue !== -1 && gameState.diceResult && card.color !== gameState.activeColor) {
       showToast(`❌ Cor errada! Precisa ser ${gameState.activeColor === 'red' ? 'VERMELHO' : 'VERDE'}`);
       return;
    }

    if (!canPlayCard(card)) return showToast('❌ Jogada Inválida (Matemática errada?)');
    
    if (card.color === 'black') {
      setPendingCardIndex(index);
      setShowColorModal(true);
    } else {
      finalizePlay(index, null);
    }
  };

  const handleColorSelection = (color) => {
    setShowColorModal(false);
    finalizePlay(pendingCardIndex, color);
    setPendingCardIndex(null);
  };

  const finalizePlay = async (idx, chosenColor) => {
    const card = myHand[idx];
    const newHand = [...myHand];
    newHand.splice(idx, 1);
    
    if (newHand.length === 0) {
      await update(ref(database, `rooms/${room}`), { 'gameState/winner': playerId, 'gameState/ended': true });
      return;
    }

    await update(ref(database, `rooms/${room}/players/${playerId}`), { hand: newHand });
    
    let updates = {
      discardPile: [...gameState.discardPile, card],
      diceResult: null, 
      direction: gameState.direction, 
      mustDraw: gameState.mustDraw || 0,
      activeColor: gameState.activeColor,
      lastNumericValue: gameState.lastNumericValue
    };

    if (card.type === 'number') {
      updates.lastNumericValue = card.value;
      updates.activeColor = card.color; // A carta jogada define a próxima cor obrigatória
    } 
    else {
      // Wild/Reverse/Action define a cor escolhida e REMOVE o valor alvo
      if (chosenColor) updates.activeColor = chosenColor;
      
      // Coringa e Reverse não têm valor numérico - usar -1 como "sem alvo" (Firebase não aceita null em update)
      if (card.type === 'wild' || card.type === 'reverse_wild') {
        updates.lastNumericValue = -1;
      }
      
      if (card.type === 'reverse_wild') updates.direction *= -1;
      if (card.type === 'action') {
        const amount = parseInt(card.value.replace('+',''));
        updates.mustDraw += amount;
      }
    }

    const nextIdx = (gameState.currentPlayerIndex + updates.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
    updates.currentPlayerIndex = nextIdx;
    updates.currentPlayerId = gameState.playerOrder[nextIdx];
    updates.turnStartTime = Date.now();

    await update(ref(database, `rooms/${room}/gameState`), updates);
  };

  const drawCard = async () => {
    if (gameState.currentPlayerId !== playerId) return;
    let deck = [...gameState.deck];
    
    if (deck.length === 0) {
      if (gameState.discardPile.length > 1) {
         const discard = [...gameState.discardPile];
         const top = discard.pop();
         deck = shuffle(discard);
         await update(ref(database, `rooms/${room}/gameState`), { discardPile: [top], deck: deck });
      } else return; 
    }

    const amount = gameState.mustDraw > 0 ? gameState.mustDraw : 1;
    const drawn = [];
    for(let i=0; i<amount && deck.length>0; i++) drawn.push(deck.pop());
    
    await update(ref(database, `rooms/${room}/players/${playerId}`), { hand: [...myHand, ...drawn] });

    let nextUpdates = {
      deck, turnStartTime: Date.now(), mustDraw: 0, diceResult: null,
      currentPlayerIndex: (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length,
      currentPlayerId: gameState.playerOrder[(gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length]
    };

    await update(ref(database, `rooms/${room}/gameState`), nextUpdates);
    showToast(`Comprou ${amount}!`);
  };

  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const showError = (title, message) => {
    setErrorModal({ title, message });
  };

  // --- COMPONENTES UI ---
  const Button = ({ children, onClick, color = 'blue', disabled, big }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: big ? '15px 30px' : '10px 20px', fontSize: big ? '1.2em' : '1em', borderRadius: '20px',
      border: '4px solid rgba(0,0,0,0.1)', background: disabled ? '#95a5a6' : COLORS[color], color: 'white',
      fontFamily: "'Comic Sans MS', cursive", fontWeight: 'bold', cursor: disabled ? 'default' : 'pointer',
      transform: disabled ? 'none' : 'scale(1)', transition: '0.1s', margin: '5px',
      boxShadow: disabled ? 'none' : '0 6px 0 rgba(0,0,0,0.2)',
      opacity: disabled ? 0.5 : 1
    }}
    onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'translateY(4px)', e.currentTarget.style.boxShadow = 'none')}
    onMouseUp={e => !disabled && (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 6px 0 rgba(0,0,0,0.2)')}
    >
      {children}
    </button>
  );

  // --- COMPONENTE CARD ATUALIZADO COM IMAGENS ---
  const Card = ({ card, onClick, small, disabled, isBack }) => {
    const width = small ? 80 : 120;
    const height = small ? 120 : 180; // Proporção 2:3 (400x600)
    
    const imagePath = getCardImagePath(card, isBack);
    
    return (
      <div 
        onClick={disabled ? undefined : onClick} 
        style={{
          width: width,
          height: height,
          borderRadius: 12,
          overflow: 'hidden',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transform: disabled ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.2)',
          position: 'relative',
        }}
      >
        <img 
          src={imagePath}
          alt={isBack ? 'Carta virada' : `Carta ${card?.value}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            borderRadius: 12,
          }}
          draggable={false}
        />
      </div>
    );
  };

  const containerStyle = {
    fontFamily: "'Comic Sans MS', sans-serif", minHeight: '100vh',
    background: COLORS.bg,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 2px, transparent 2px)',
    backgroundSize: '30px 30px', color: 'white',
    display: 'flex', flexDirection: 'column', alignItems: 'center'
  };

  // Modal de Erro
  const ErrorModal = () => errorModal && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'white', padding: '30px 40px', borderRadius: 25, textAlign: 'center',
        border: `6px solid ${COLORS.red}`, maxWidth: 350, boxShadow: '0 10px 40px rgba(0,0,0,0.4)'
      }}>
        <div style={{ fontSize: '3em', marginBottom: 10 }}>😅</div>
        <h2 style={{ color: COLORS.red, margin: '0 0 10px 0', fontSize: '1.5em' }}>{errorModal.title}</h2>
        <p style={{ color: '#333', margin: '0 0 20px 0', fontSize: '1.1em' }}>{errorModal.message}</p>
        <Button color="blue" big onClick={() => setErrorModal(null)}>OK</Button>
      </div>
    </div>
  );

  if (screen === 'menu') return (
    <div style={{...containerStyle, justifyContent: 'center'}}>
      <ErrorModal />
      <div style={{background: 'rgba(0,0,0,0.2)', padding: 40, borderRadius: 30, border: '6px solid rgba(255,255,255,0.2)', textAlign: 'center'}}>
        <h1 style={{fontSize: '4em', margin: 0, textShadow: '0 5px 0 #000'}}>🐊 ViraVolta</h1>
        <p style={{marginBottom: 30, fontSize: '1.2em'}}>Aprendendo com Jacaré Zezé</p>
        <input placeholder="Seu Nome" value={playerName} onChange={e=>setPlayerName(e.target.value)}
          style={{display: 'block', width: '100%', padding: 15, borderRadius: 15, border: 'none', marginBottom: 15, fontSize: '1.2em', textAlign: 'center'}} />
        <Button big color="gold" onClick={createRoom}>✨ Criar Sala</Button>
        <div style={{margin: 20}}>ou</div>
        <div style={{display: 'flex', gap: 10}}>
          <input placeholder="CÓDIGO" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}
            style={{flex: 1, padding: 15, borderRadius: 15, border: 'none', fontSize: '1.2em', textAlign: 'center', textTransform: 'uppercase'}} />
          <Button big onClick={joinRoom}>Entrar</Button>
        </div>
      </div>
    </div>
  );

  if (screen === 'lobby') return (
    <div style={{...containerStyle, padding: 20}}>
      <ErrorModal />
      <h2 style={{background: 'white', color: COLORS.bg, padding: '10px 40px', borderRadius: 50, border: `4px solid ${COLORS.gold}`}}>Sala: {room}</h2>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, width: '100%', maxWidth: 600, marginTop: 40}}>
        {players.map(p => (
          <div key={p.id} style={{
            background: p.ready ? COLORS.green : 'rgba(0,0,0,0.2)',
            padding: 20, borderRadius: 20, textAlign: 'center', border: p.id===hostId ? `4px solid ${COLORS.gold}` : '4px solid transparent'
          }}>
            {p.id === hostId && <div style={{position: 'absolute', top: -15, right: -10, fontSize: '2em'}}>👑</div>}
            <div style={{fontSize: '4em'}}>{p.avatar}</div>
            <div style={{fontSize: '1.5em', fontWeight: 'bold'}}>{p.name}</div>
            <div>{p.ready ? 'PRONTO!' : 'Aguardando...'}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop: 'auto', marginBottom: 40, display: 'flex', gap: 20}}>
        <Button big color={players.find(p=>p.id===playerId)?.ready ? 'red' : 'green'} onClick={toggleReady}>
          {players.find(p=>p.id===playerId)?.ready ? 'Cancelar' : 'Estou Pronto!'}
        </Button>
        {hostId === playerId && <Button big color="blue" onClick={startGame}>Começar Jogo</Button>}
      </div>
    </div>
  );

  if (screen === 'game' && gameState) {
    const isMyTurn = gameState.currentPlayerId === playerId;
    const topCard = gameState.discardPile[gameState.discardPile.length-1];
    const diceRes = gameState.diceResult;
    const mustDraw = gameState.mustDraw > 0;
    
    // Mostra o que precisa ser feito no HUD
    // Se tiver dado, mostra Símbolo + Cor
    let ruleDisplay = '🎲';
    let ruleColor = COLORS.gold;
    
    if (diceRes) {
       ruleDisplay = diceRes;
       ruleColor = gameState.activeColor === 'red' ? COLORS.red : COLORS.green;
    } else if (!mustDraw) {
       // Se não tem dado mas tem cor ativa anterior (aguardando rolar)
       ruleColor = gameState.activeColor === 'red' ? COLORS.red : COLORS.green;
    }

    return (
      <div style={containerStyle}>
        <ErrorModal />
        {showColorModal && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{background: 'white', padding: 30, borderRadius: 30, textAlign: 'center', border: `8px solid ${COLORS.gold}`}}>
              <h2 style={{color: '#333', margin: '0 0 20px 0'}}>Escolha a Cor:</h2>
              <div style={{display: 'flex', gap: 20}}>
                <button onClick={()=>handleColorSelection('red')} style={{background: COLORS.red, border:'none', padding: '30px 50px', borderRadius: 20, color:'white', fontSize:'1.5em', cursor:'pointer'}}>Vermelho<br/>(PAR)</button>
                <button onClick={()=>handleColorSelection('green')} style={{background: COLORS.green, border:'none', padding: '30px 50px', borderRadius: 20, color:'white', fontSize:'1.5em', cursor:'pointer'}}>Verde<br/>(ÍMPAR)</button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div style={{position: 'fixed', top: 100, left: '50%', transform: 'translateX(-50%)', background: COLORS.gold, color: '#333', padding: '15px 40px', borderRadius: 50, fontWeight: 'bold', fontSize: '1.2em', boxShadow: '0 10px 20px rgba(0,0,0,0.3)', zIndex: 90}}>
            {message}
          </div>
        )}

        {/* HUD */}
        <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', padding: 20, boxSizing: 'border-box'}}>
          <div style={{background: 'rgba(0,0,0,0.3)', padding: '5px 20px', borderRadius: 20, border: '2px solid rgba(255,255,255,0.2)'}}>⏱️ {timeLeft}s</div>
          <div style={{background: 'rgba(0,0,0,0.3)', padding: '5px 20px', borderRadius: 20, border: '2px solid rgba(255,255,255,0.2)'}}>🃏 {gameState.deck.length}</div>
        </div>

        {/* ADVERSÁRIOS */}
        <div style={{display: 'flex', gap: 15, marginBottom: 10}}>
          {players.filter(p => p.id !== playerId).map(p => (
            <div key={p.id} style={{opacity: p.id===gameState.currentPlayerId ? 1 : 0.5, transform: p.id===gameState.currentPlayerId ? 'scale(1.1)' : 'scale(1)', transition: '0.3s', textAlign: 'center'}}>
              <div style={{fontSize: '2.5em'}}>{p.avatar}</div>
              <div style={{background: 'white', color: '#333', padding: '2px 10px', borderRadius: 10, fontWeight: 'bold'}}>{p.hand?.length || 0}</div>
            </div>
          ))}
        </div>

        {/* MESA */}
        <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, width: '100%'}}>
          <Card isBack />
          
          <div style={{
            width: 150, height: 150, borderRadius: '50%', background: mustDraw ? COLORS.red : ruleColor,
            border: '8px solid white', 
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 30px ${mustDraw ? COLORS.red : ruleColor}`,
            color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)', zIndex: 10, position: 'relative'
          }}>
             {!mustDraw && gameState.lastNumericValue !== -1 && (
               <div style={{position: 'absolute', top: -30, background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: 10, color: 'white', fontSize: '0.8em'}}>
                 Alvo: {gameState.lastNumericValue}
               </div>
             )}

            {mustDraw ? (
              <>
                <div style={{fontSize: '2.5em'}}>💣</div>
                <div style={{fontWeight: 'bold', fontSize: '1.5em'}}>+{gameState.mustDraw}</div>
              </>
            ) : (
              <>
                <div style={{fontSize: '0.8em', textTransform: 'uppercase', opacity: 0.9}}>JOGUE</div>
                <div style={{fontSize: '4em', fontWeight: 'bold', lineHeight: 0.9}}>{ruleDisplay}</div>
                {diceRes && (
                   <div style={{fontSize: '0.7em', marginTop: 5, fontWeight: 'bold'}}>
                      {gameState.activeColor === 'red' ? 'VERMELHO' : 'VERDE'}
                   </div>
                )}
              </>
            )}
          </div>

          <Card card={topCard} />
        </div>

        {/* AÇÕES */}
        <div style={{height: 80, display: 'flex', alignItems: 'center', gap: 20}}>
          <Button onClick={rollDice} disabled={!!diceRes || !isMyTurn || mustDraw || gameState.lastNumericValue === -1} big color="blue">
            🎲 Rolar ({diceRes || '?'})
          </Button>
          <Button onClick={drawCard} disabled={!isMyTurn} big color={mustDraw ? "red" : "green"}>
            {mustDraw ? `Pegar ${gameState.mustDraw}` : '📥 Comprar'}
          </Button>
        </div>

        {/* MÃO */}
        <div style={{width: '100%', padding: 20, overflowX: 'auto', whiteSpace: 'nowrap', background: isMyTurn ? 'rgba(255,255,255,0.1)' : 'transparent', borderTop: `4px solid ${isMyTurn ? COLORS.gold : 'transparent'}`}}>
          <div style={{display: 'inline-flex', gap: 5, padding: '0 20px'}}>
            {myHand.map((c, i) => (
              <div key={c.id} style={{transform: isMyTurn && canPlayCard(c) ? 'translateY(-15px)' : 'none', transition: '0.2s'}}>
                <Card card={c} small onClick={() => handleCardClick(i)} disabled={!isMyTurn || !canPlayCard(c)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'gameOver') return (
    <div style={{...containerStyle, justifyContent: 'center'}}>
      <ErrorModal />
      <h1 style={{fontSize: '3em'}}>🏆 Fim de Jogo! 🏆</h1>
      <div style={{fontSize: '6em'}}>{players.find(p=>p.id===gameState.winner)?.avatar}</div>
      <h2 style={{margin: 20}}>{players.find(p=>p.id===gameState.winner)?.name} Venceu!</h2>
      <Button big onClick={()=>setScreen('menu')}>Voltar ao Menu</Button>
    </div>
  );

  return null;
};

export default ViraVoltaMultiplayer;