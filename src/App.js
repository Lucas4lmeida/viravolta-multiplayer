import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, update, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

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
  const [timeLeft, setTimeLeft] = useState(TURN_TIME);
  const [hostId, setHostId] = useState(null);
  
  // Detectar tamanho da tela
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Variáveis responsivas
  const isMobile = windowSize.width < 768;
  const isSmallMobile = windowSize.width < 480;
  const cardSize = {
    small: { width: isSmallMobile ? 55 : isMobile ? 65 : 80, height: isSmallMobile ? 82 : isMobile ? 97 : 120 },
    normal: { width: isSmallMobile ? 80 : isMobile ? 100 : 120, height: isSmallMobile ? 120 : isMobile ? 150 : 180 }
  };
  const diceSize = isSmallMobile ? 100 : isMobile ? 120 : 150;
  
  // Refs para evitar ações duplicadas
  const isProcessingAction = useRef(false);
  const lastTurnPlayerId = useRef(null);
  const hasVibratedVictory = useRef(false);
  
  // Estados de animação
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [playedCard, setPlayedCard] = useState(null); // Carta sendo animada
  
  // Função para vibrar no mobile
  const vibrate = (pattern = [200]) => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) {
      console.log('Vibração não suportada');
    }
  };

  // Função para tocar som de notificação
  const playTurnSound = () => {
    // Vibra no mobile (padrão: 200ms)
    vibrate([200]);
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880; // Nota A5
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log('Som não suportado');
    }
  };

  // Som de carta sendo jogada
  const playCardSound = () => {
    // Vibração curta ao jogar carta
    vibrate([100]);
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 220;
      oscillator.type = 'triangle';
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
      console.log('Som não suportado');
    }
  };

  // Som do dado rolando
  const playDiceSound = () => {
    // Vibração sequencial para simular dado
    vibrate([50, 50, 50, 50, 50, 50, 100]);
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Sequência de tons para simular dado rolando
      [0, 100, 200, 300, 400].forEach((delay, i) => {
        setTimeout(() => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.value = 300 + Math.random() * 200;
          osc.type = 'square';
          gain.gain.setValueAtTime(0.1, audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          osc.start(audioContext.currentTime);
          osc.stop(audioContext.currentTime + 0.1);
        }, delay);
      });
    } catch (e) {
      console.log('Som não suportado');
    }
  };

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

  // Detectar mudança de turno
  useEffect(() => {
    if (gameState?.started && !gameState?.ended && gameState.currentPlayerId) {
      // Só dispara se mudou o jogador da vez
      if (lastTurnPlayerId.current !== gameState.currentPlayerId) {
        lastTurnPlayerId.current = gameState.currentPlayerId;
        
        if (gameState.currentPlayerId === playerId) {
          // É minha vez!
          playTurnSound();
          
          // Vibração extra se precisa comprar cartas (+2/+4)
          if (gameState.mustDraw > 0) {
            setTimeout(() => vibrate([300, 100, 300]), 300); // Vibração de alerta
            showToast(`⚠️ Você precisa comprar ${gameState.mustDraw} cartas!`);
          } else {
            showToast('🎯 Sua vez!');
          }
        } else {
          // Vez de outro jogador
          const currentPlayer = players.find(p => p.id === gameState.currentPlayerId);
          if (currentPlayer) {
            showToast(`⏳ Vez de ${currentPlayer.name}`);
          }
        }
      }
    }
  }, [gameState?.currentPlayerId, gameState?.started, gameState?.ended, gameState?.mustDraw, playerId, players]);

  // Timer
  useEffect(() => {
    if (gameState?.started && !gameState?.ended) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
        const remaining = Math.max(0, TURN_TIME - elapsed);
        setTimeLeft(remaining);
        
        // Vibrar nos últimos 5 segundos se for sua vez
        if (remaining <= 5 && remaining > 0 && gameState.currentPlayerId === playerId) {
          vibrate([100]);
        }
        
        // Se tempo acabou e não está processando outra ação
        if (remaining <= 0 && gameState.currentPlayerId === playerId && !isProcessingAction.current) {
          isProcessingAction.current = true;
          
          // Se modal de cor está aberto, escolhe cor aleatória
          if (showColorModal && pendingCardIndex !== null) {
            const randomColor = Math.random() > 0.5 ? 'red' : 'green';
            setShowColorModal(false);
            finalizePlay(pendingCardIndex, randomColor).finally(() => {
              isProcessingAction.current = false;
            });
            setPendingCardIndex(null);
            showToast(`⏰ Tempo! Cor escolhida: ${randomColor === 'red' ? 'Vermelho' : 'Verde'}`);
          } else if (!showColorModal) {
            // Compra automática
            drawCard().finally(() => {
              isProcessingAction.current = false;
            });
          } else {
            isProcessingAction.current = false;
          }
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, playerId, showColorModal, pendingCardIndex]);

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
        label: i % 2 === 0 ? 'PAR' : 'ÍMPAR'
      };
      // 2 cópias de cada
      newDeck.push(card);
      newDeck.push({...card, id: `n_${i}_2_${Math.random()}`});
    }
    // Coringas (Troca Cor) - 6 cartas
    for (let i = 0; i < 6; i++) {
      newDeck.push({ id: `wild_${i}`, value: '★', type: 'wild', color: 'black', label: 'CORINGA' });
    }
    // Reverse (Inverte + Troca Cor) - 4 cartas
    for (let i = 0; i < 4; i++) {
      newDeck.push({ id: `rev_${i}`, value: '⇄', type: 'reverse_wild', color: 'black', label: 'INVERTER' });
    }
    // Ação (+2, +4) - 6 de cada
    ['+2', '+4'].forEach(act => {
      for (let i = 0; i < 6; i++) {
        newDeck.push({ id: `act_${act}_${i}_${Math.random()}`, value: act, type: 'action', color: 'black', label: 'ATAQUE' });
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
    if (!database) return showError('Erro!', 'Conexão com servidor falhou. Recarregue a página.');
    
    const rRef = ref(database, `rooms/${roomCode.toUpperCase()}`);
    const snap = await get(rRef);
    if (snap.exists()) {
      const roomData = snap.val();
      const playersList = Object.keys(roomData.players || {});
      
      // Bug 9: Verifica se já está na sala
      if (playersList.includes(playerId)) {
        setRoom(roomCode.toUpperCase());
        setScreen('lobby');
        return;
      }
      
      if (playersList.length >= 4) return showError('Sala Cheia!', 'Esta sala já tem 4 jogadores.');
      
      await update(ref(database, `rooms/${roomCode.toUpperCase()}/players/${playerId}`), {
        id: playerId, name: playerName, hand: [], ready: false, avatar: AVATARS[playersList.length % AVATARS.length], joinOrder: playersList.length
      });
      setRoom(roomCode.toUpperCase());
      setScreen('lobby');
    } else {
      showError('Sala não encontrada!', 'Verifique o código e tente novamente.');
    }
  };

  // Bug 10: Função para sair da sala
  const leaveRoom = async () => {
    if (!room || !database) return;
    
    try {
      const roomRef = ref(database, `rooms/${room}`);
      const snap = await get(roomRef);
      
      if (snap.exists()) {
        const roomData = snap.val();
        const playersList = Object.keys(roomData.players || {});
        
        // Se é o único jogador, deleta a sala
        if (playersList.length <= 1) {
          await set(roomRef, null);
        } else {
          // Remove o jogador
          await set(ref(database, `rooms/${room}/players/${playerId}`), null);
          
          // Se era o host, passa para o próximo
          if (roomData.host === playerId) {
            const newHost = playersList.find(id => id !== playerId);
            if (newHost) {
              await update(roomRef, { host: newHost });
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
    
    setRoom(null);
    setRoomCode('');
    setScreen('menu');
    setGameState(null);
    setPlayers([]);
    setMyHand([]);
    hasVibratedVictory.current = false;
  };

  const toggleReady = async () => {
    if (!database || !room) return;
    const pRef = ref(database, `rooms/${room}/players/${playerId}`);
    const s = await get(pRef);
    if (s.exists()) {
      await update(pRef, { ready: !s.val().ready });
    }
  };

  const startGame = async () => {
    if (!database || !room) return;
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
    
    // Inicia animação e som do dado
    setIsRollingDice(true);
    playDiceSound();
    
    setTimeout(async () => {
      // Probabilidade: 45% Maior, 45% Menor, 10% Igual
      const rand = Math.random();
      let res = '>';
      if (rand < 0.45) res = '>';
      else if (rand < 0.90) res = '<';
      else res = '=';

      await update(ref(database, `rooms/${room}/gameState`), { diceResult: res });
      setIsRollingDice(false);
      const diceNames = { '>': 'MAIOR', '<': 'MENOR', '=': 'IGUAL' };
      showToast(`🐊 ${diceNames[res]}!`);
    }, 1000); // Aumentei para 1s para dar tempo da animação
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
    
    // Inicia animação da carta
    setPlayedCard(card);
    
    // Toca som de carta
    playCardSound();
    
    setTimeout(() => {
      if (card.color === 'black') {
        setPendingCardIndex(index);
        setShowColorModal(true);
        setPlayedCard(null);
      } else {
        finalizePlay(index, null);
      }
    }, 400); // Tempo da animação
  };

  const handleColorSelection = (color) => {
    setShowColorModal(false);
    setPlayedCard(myHand[pendingCardIndex]); // Ativa animação
    setTimeout(() => {
      finalizePlay(pendingCardIndex, color);
      setPendingCardIndex(null);
    }, 400);
  };

  const finalizePlay = async (idx, chosenColor) => {
    const card = myHand[idx];
    const newHand = [...myHand];
    newHand.splice(idx, 1);
    
    // Sempre atualiza a mão primeiro
    await update(ref(database, `rooms/${room}/players/${playerId}`), { hand: newHand });
    
    // Se mão vazia, jogador venceu
    if (newHand.length === 0) {
      await update(ref(database, `rooms/${room}/gameState`), { winner: playerId, ended: true });
      return;
    }
    
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
      
      // Coringa, Reverse e Ações (+2, +4) não têm valor numérico
      if (card.type === 'wild' || card.type === 'reverse_wild' || card.type === 'action') {
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
    setPlayedCard(null);
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
      padding: big ? (isMobile ? '12px 20px' : '15px 30px') : (isMobile ? '8px 15px' : '10px 20px'), 
      fontSize: big ? (isMobile ? '1em' : '1.2em') : (isMobile ? '0.9em' : '1em'), 
      borderRadius: '20px',
      border: '4px solid rgba(0,0,0,0.1)', background: disabled ? '#95a5a6' : COLORS[color], color: 'white',
      fontFamily: "'Comic Sans MS', cursive", fontWeight: 'bold', cursor: disabled ? 'default' : 'pointer',
      transform: disabled ? 'none' : 'scale(1)', transition: '0.1s', margin: '5px',
      boxShadow: disabled ? 'none' : '0 6px 0 rgba(0,0,0,0.2)',
      opacity: disabled ? 0.5 : 1,
      whiteSpace: 'nowrap'
    }}
    onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'translateY(4px)', e.currentTarget.style.boxShadow = 'none')}
    onMouseUp={e => !disabled && (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 6px 0 rgba(0,0,0,0.2)')}
    >
      {children}
    </button>
  );

  // --- COMPONENTE CARD ATUALIZADO COM IMAGENS ---
  const Card = ({ card, onClick, small, disabled, isBack }) => {
    const size = small ? cardSize.small : cardSize.normal;
    
    const imagePath = getCardImagePath(card, isBack);
    
    return (
      <div 
        onClick={disabled ? undefined : onClick} 
        style={{
          width: size.width,
          height: size.height,
          borderRadius: isMobile ? 8 : 12,
          overflow: 'hidden',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transform: disabled ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.2)',
          position: 'relative',
          flexShrink: 0
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
            borderRadius: isMobile ? 8 : 12,
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
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    overflowX: 'hidden',
    WebkitTapHighlightColor: 'transparent'
  };

  // Modal de Erro
  const ErrorModal = () => errorModal && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, boxSizing: 'border-box'
    }}>
      <div style={{
        background: 'white', padding: isMobile ? '20px 25px' : '30px 40px', borderRadius: 25, textAlign: 'center',
        border: `${isMobile ? 4 : 6}px solid ${COLORS.red}`, maxWidth: isMobile ? '90%' : 350, boxShadow: '0 10px 40px rgba(0,0,0,0.4)'
      }}>
        <div style={{ fontSize: isMobile ? '2.5em' : '3em', marginBottom: 10 }}>😅</div>
        <h2 style={{ color: COLORS.red, margin: '0 0 10px 0', fontSize: isMobile ? '1.2em' : '1.5em' }}>{errorModal.title}</h2>
        <p style={{ color: '#333', margin: '0 0 20px 0', fontSize: isMobile ? '0.95em' : '1.1em' }}>{errorModal.message}</p>
        <Button color="blue" big onClick={() => setErrorModal(null)}>OK</Button>
      </div>
    </div>
  );

  if (screen === 'menu') return (
    <div style={{...containerStyle, justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: isMobile ? 15 : 20, boxSizing: 'border-box', overflow: 'auto'}}>
      <ErrorModal />
      <div style={{background: 'rgba(0,0,0,0.2)', padding: isMobile ? '20px 25px' : '30px 40px', borderRadius: isMobile ? 20 : 30, border: `${isMobile ? 4 : 6}px solid rgba(255,255,255,0.2)`, textAlign: 'center', maxWidth: 400, width: '100%'}}>
        <img src="/logo.png" alt="ViraVolta" style={{ width: '100%', maxWidth: isMobile ? 200 : 250, marginBottom: 5 }} />
        <p style={{marginBottom: isMobile ? 15 : 20, fontSize: isMobile ? '1em' : '1.1em'}}>Aprendendo com Jacaré Zezé</p>
        <input placeholder="Seu Nome" value={playerName} onChange={e=>setPlayerName(e.target.value)}
          style={{display: 'block', width: '100%', padding: isMobile ? 10 : 12, borderRadius: 15, border: 'none', marginBottom: 10, fontSize: isMobile ? '1em' : '1.1em', textAlign: 'center', boxSizing: 'border-box'}} />
        <Button big color="gold" onClick={createRoom}>✨ Criar Sala</Button>
        <div style={{margin: isMobile ? 10 : 15}}>ou</div>
        <div style={{display: 'flex', gap: 10}}>
          <input placeholder="CÓDIGO" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}
            style={{flex: 1, padding: isMobile ? 10 : 12, borderRadius: 15, border: 'none', fontSize: isMobile ? '1em' : '1.1em', textAlign: 'center', textTransform: 'uppercase', minWidth: 0}} />
          <Button big onClick={joinRoom}>Entrar</Button>
        </div>
      </div>
    </div>
  );

  if (screen === 'lobby') return (
    <div style={{...containerStyle, padding: isMobile ? 10 : 20}}>
      <ErrorModal />
      <h2 style={{background: 'white', color: COLORS.bg, padding: isMobile ? '8px 25px' : '10px 40px', borderRadius: 50, border: `4px solid ${COLORS.gold}`, fontSize: isMobile ? '1.1em' : '1.3em'}}>Sala: {room}</h2>
      <div style={{display: 'grid', gridTemplateColumns: isSmallMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 10 : 20, width: '100%', maxWidth: 600, marginTop: isMobile ? 20 : 40, padding: '0 10px', boxSizing: 'border-box'}}>
        {players.map(p => (
          <div key={p.id} style={{
            background: p.ready ? COLORS.green : 'rgba(0,0,0,0.2)',
            padding: isMobile ? 15 : 20, borderRadius: 20, textAlign: 'center', 
            border: p.id===hostId ? `4px solid ${COLORS.gold}` : '4px solid transparent',
            position: 'relative'
          }}>
            {p.id === hostId && <div style={{position: 'absolute', top: -15, right: -10, fontSize: isMobile ? '1.5em' : '2em'}}>👑</div>}
            <div style={{fontSize: isMobile ? '3em' : '4em'}}>{p.avatar}</div>
            <div style={{fontSize: isMobile ? '1.2em' : '1.5em', fontWeight: 'bold'}}>{p.name}</div>
            <div style={{fontSize: isMobile ? '0.9em' : '1em'}}>{p.ready ? 'PRONTO!' : 'Aguardando...'}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop: 'auto', marginBottom: isMobile ? 20 : 40, display: 'flex', gap: isMobile ? 10 : 20, flexWrap: 'wrap', justifyContent: 'center', padding: '0 10px'}}>
        <Button big color="red" onClick={leaveRoom}>🚪 Sair</Button>
        <Button big color={players.find(p=>p.id===playerId)?.ready ? 'gold' : 'green'} onClick={toggleReady}>
          {players.find(p=>p.id===playerId)?.ready ? 'Cancelar' : 'Estou Pronto!'}
        </Button>
        {hostId === playerId && <Button big color="blue" onClick={startGame}>Começar</Button>}
      </div>
    </div>
  );

  if (screen === 'game' && gameState) {
    const isMyTurn = gameState.currentPlayerId === playerId;
    const topCard = gameState.discardPile[gameState.discardPile.length-1];
    const diceRes = gameState.diceResult;
    const mustDraw = gameState.mustDraw > 0;
    
    // Mostra o que precisa ser feito no HUD
    // Se tiver dado, mostra Imagem do Jacaré + Cor
    let ruleDisplay = '🎲';
    let ruleColor = COLORS.gold;
    let zezeImage = null;
    
    if (diceRes) {
       if (diceRes === '>') zezeImage = '/alligator_1.png';
       else if (diceRes === '=') zezeImage = '/alligator_2.png';
       else if (diceRes === '<') zezeImage = '/alligator_3.png';
       
       ruleColor = gameState.activeColor === 'red' ? COLORS.red : COLORS.green;
    } else if (!mustDraw) {
       // Se não tem dado mas tem cor ativa anterior (aguardando rolar)
       ruleColor = gameState.activeColor === 'red' ? COLORS.red : COLORS.green;
    }

    return (
      <div style={containerStyle}>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes shake {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-15deg); }
            75% { transform: rotate(15deg); }
          }
          @keyframes flyToCenter {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-200px) scale(0.8); opacity: 0; }
          }
          @keyframes spin {
            0% { transform: rotate(0deg) scale(1); }
            50% { transform: rotate(180deg) scale(1.2); }
            100% { transform: rotate(360deg) scale(1); }
          }
          @keyframes bounceIn {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes arrowBounce {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(5px); }
          }
        `}</style>
        <ErrorModal />
        {showColorModal && (
          <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, boxSizing: 'border-box'}}>
            <div style={{background: 'white', padding: isMobile ? 20 : 30, borderRadius: isMobile ? 20 : 30, textAlign: 'center', border: `${isMobile ? 4 : 8}px solid ${COLORS.gold}`, maxWidth: '90%'}}>
              <h2 style={{color: '#333', margin: '0 0 15px 0', fontSize: isMobile ? '1.2em' : '1.5em'}}>Escolha a Cor:</h2>
              <div style={{display: 'flex', gap: isMobile ? 10 : 20, flexDirection: isSmallMobile ? 'column' : 'row'}}>
                <button onClick={()=>handleColorSelection('red')} style={{background: COLORS.red, border:'none', padding: isMobile ? '20px 30px' : '30px 50px', borderRadius: 20, color:'white', fontSize: isMobile ? '1.1em' : '1.5em', cursor:'pointer'}}>Vermelho<br/>(PAR)</button>
                <button onClick={()=>handleColorSelection('green')} style={{background: COLORS.green, border:'none', padding: isMobile ? '20px 30px' : '30px 50px', borderRadius: 20, color:'white', fontSize: isMobile ? '1.1em' : '1.5em', cursor:'pointer'}}>Verde<br/>(ÍMPAR)</button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div style={{position: 'fixed', top: isMobile ? 70 : 100, left: '50%', transform: 'translateX(-50%)', background: COLORS.gold, color: '#333', padding: isMobile ? '10px 20px' : '15px 40px', borderRadius: 50, fontWeight: 'bold', fontSize: isMobile ? '1em' : '1.2em', boxShadow: '0 10px 20px rgba(0,0,0,0.3)', zIndex: 90, maxWidth: '90%', textAlign: 'center'}}>
            {message}
          </div>
        )}

        {/* HUD */}
        <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', padding: isMobile ? '10px 10px' : '20px 20px', boxSizing: 'border-box', gap: 5}}>
          <div style={{background: 'rgba(0,0,0,0.3)', padding: isMobile ? '4px 10px' : '5px 20px', borderRadius: 20, border: '2px solid rgba(255,255,255,0.2)', fontSize: isMobile ? '0.8em' : '1em'}}>⏱️ {timeLeft}s</div>
          
          {/* Indicador de turno */}
          <div style={{
            background: isMyTurn ? COLORS.gold : 'rgba(0,0,0,0.3)', 
            padding: isMobile ? '4px 10px' : '5px 20px', 
            borderRadius: 20, 
            border: isMyTurn ? '2px solid white' : '2px solid rgba(255,255,255,0.2)',
            fontWeight: 'bold',
            animation: isMyTurn ? 'pulse 1s infinite' : 'none',
            fontSize: isMobile ? '0.75em' : '1em',
            maxWidth: isMobile ? '40%' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {isMyTurn ? '🎯 SUA VEZ!' : `⏳ ${players.find(p => p.id === gameState.currentPlayerId)?.name || '...'}`}
          </div>
          
          <div style={{background: 'rgba(0,0,0,0.3)', padding: isMobile ? '4px 10px' : '5px 20px', borderRadius: 20, border: '2px solid rgba(255,255,255,0.2)', fontSize: isMobile ? '0.8em' : '1em'}}>🃏 {gameState.deck.length}</div>
        </div>

        {/* ADVERSÁRIOS */}
        <div style={{display: 'flex', gap: isMobile ? 10 : 15, marginBottom: isMobile ? 5 : 10, flexWrap: 'wrap', justifyContent: 'center'}}>
          {players.filter(p => p.id !== playerId).map(p => (
            <div key={p.id} style={{opacity: p.id===gameState.currentPlayerId ? 1 : 0.5, transform: p.id===gameState.currentPlayerId ? 'scale(1.1)' : 'scale(1)', transition: '0.3s', textAlign: 'center'}}>
              <div style={{fontSize: isMobile ? '1.8em' : '2.5em'}}>{p.avatar}</div>
              <div style={{background: 'white', color: '#333', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold', fontSize: isMobile ? '0.8em' : '1em'}}>{p.hand?.length || 0}</div>
            </div>
          ))}
        </div>

        {/* MESA */}
        <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 10 : 20, width: '100%', position: 'relative', padding: '0 10px', boxSizing: 'border-box'}}>
          
          {/* Indicador de Direção - escondido em mobile muito pequeno */}
          {!isSmallMobile && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: isMobile ? 5 : 20,
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3
            }}>
              <div style={{
                fontSize: isMobile ? '1.3em' : '2em',
                animation: 'arrowBounce 1s infinite',
                transform: gameState.direction === 1 ? 'rotate(0deg)' : 'rotate(180deg)'
              }}>
                ➡️
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.4)',
                padding: isMobile ? '3px 6px' : '5px 10px',
                borderRadius: 10,
                fontSize: isMobile ? '0.5em' : '0.7em',
                fontWeight: 'bold'
              }}>
                {gameState.direction === 1 ? 'HORÁRIO' : 'ANTI'}
              </div>
            </div>
          )}
          
          <Card isBack />
          
          {/* Área do dado com animação */}
          <div style={{
            width: diceSize, height: diceSize, borderRadius: '50%', 
            background: mustDraw ? COLORS.red : ruleColor,
            border: `${isMobile ? 4 : 8}px solid white`, 
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 ${isMobile ? 15 : 30}px ${mustDraw ? COLORS.red : ruleColor}`,
            color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)', zIndex: 10, position: 'relative',
            animation: isRollingDice ? 'shake 0.2s infinite' : (zezeImage ? 'bounceIn 0.3s ease-out' : 'none'),
            flexShrink: 0
          }}>
             {!mustDraw && gameState.lastNumericValue !== -1 && (
               <div style={{position: 'absolute', top: isMobile ? -22 : -30, background: 'rgba(0,0,0,0.6)', padding: isMobile ? '3px 8px' : '5px 10px', borderRadius: 10, color: 'white', fontSize: isMobile ? '0.7em' : '0.8em'}}>
                 Alvo: {gameState.lastNumericValue}
               </div>
             )}

            {mustDraw ? (
              <>
                <div style={{fontSize: isMobile ? '1.8em' : '2.5em'}}>💣</div>
                <div style={{fontWeight: 'bold', fontSize: isMobile ? '1.2em' : '1.5em'}}>+{gameState.mustDraw}</div>
              </>
            ) : isRollingDice ? (
              <>
                <div style={{fontSize: isMobile ? '2em' : '3em', animation: 'spin 0.3s infinite linear'}}>🎲</div>
                <div style={{fontSize: isMobile ? '0.6em' : '0.8em', marginTop: 5}}>Rolando...</div>
              </>
            ) : (
              <>
                <div style={{fontSize: isMobile ? '0.6em' : '0.8em', textTransform: 'uppercase', opacity: 0.9}}>JOGUE</div>
                {zezeImage ? (
                  <img src={zezeImage} alt={diceRes} style={{ width: isMobile ? 50 : 80, height: 'auto', marginTop: 3, marginBottom: 3 }} />
                ) : (
                  <div style={{fontSize: isMobile ? '2.5em' : '4em', fontWeight: 'bold', lineHeight: 0.9}}>{ruleDisplay}</div>
                )}
                {diceRes && (
                   <div style={{fontSize: isMobile ? '0.55em' : '0.7em', marginTop: 3, fontWeight: 'bold'}}>
                      {gameState.activeColor === 'red' ? 'VERMELHO' : 'VERDE'}
                   </div>
                )}
              </>
            )}
          </div>

          <Card card={topCard} />
          
          {/* Carta animada voando para mesa */}
          {playedCard && (
            <div style={{
              position: 'absolute',
              bottom: -100,
              left: '50%',
              transform: 'translateX(-50%)',
              animation: 'flyToCenter 0.4s ease-out forwards',
              zIndex: 50
            }}>
              <Card card={playedCard} small />
            </div>
          )}
        </div>

        {/* AÇÕES */}
        <div style={{minHeight: isMobile ? 60 : 80, display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20, flexWrap: 'wrap', justifyContent: 'center', padding: '5px 10px'}}>
          <Button onClick={rollDice} disabled={!!diceRes || !isMyTurn || mustDraw || gameState.lastNumericValue === -1} big color="blue">
            🎲 {isMobile ? '' : 'Rolar'} {diceRes ? (diceRes === '>' ? '(MAIOR)' : diceRes === '<' ? '(MENOR)' : '(IGUAL)') : ''}
          </Button>
          <Button onClick={drawCard} disabled={!isMyTurn} big color={mustDraw ? "red" : "green"}>
            {mustDraw ? `+${gameState.mustDraw}` : (isMobile ? '📥' : '📥 Comprar')}
          </Button>
        </div>

        {/* MÃO */}
        <div style={{width: '100%', padding: isMobile ? '10px 5px' : '20px', overflowX: 'auto', whiteSpace: 'nowrap', background: isMyTurn ? 'rgba(255,255,255,0.1)' : 'transparent', borderTop: `${isMobile ? 2 : 4}px solid ${isMyTurn ? COLORS.gold : 'transparent'}`, WebkitOverflowScrolling: 'touch'}}>
          <div style={{display: 'inline-flex', gap: isMobile ? 3 : 5, padding: isMobile ? '0 10px' : '0 20px'}}>
            {myHand.map((c, i) => (
              <div 
                key={c.id} 
                style={{
                  transform: isMyTurn && canPlayCard(c) ? `translateY(${isMobile ? -10 : -15}px)` : 'none', 
                  transition: 'all 0.2s ease',
                  opacity: playedCard?.id === c.id ? 0 : 1
                }}
              >
                <Card card={c} small onClick={() => handleCardClick(i)} disabled={!isMyTurn || !canPlayCard(c)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'gameOver') {
    // Vibração de celebração se você venceu (apenas uma vez)
    if (gameState?.winner === playerId && !hasVibratedVictory.current) {
      hasVibratedVictory.current = true;
      vibrate([100, 50, 100, 50, 200]);
    }
    
    return (
    <div style={{...containerStyle, justifyContent: 'center', padding: 20}}>
      <ErrorModal />
      <h1 style={{fontSize: isMobile ? '2em' : '3em', textAlign: 'center'}}>🏆 Fim de Jogo! 🏆</h1>
      <div style={{fontSize: isMobile ? '4em' : '6em'}}>{players.find(p=>p.id===gameState?.winner)?.avatar}</div>
      <h2 style={{margin: 20, fontSize: isMobile ? '1.3em' : '1.5em', textAlign: 'center'}}>{players.find(p=>p.id===gameState?.winner)?.name} Venceu!</h2>
      <div style={{display: 'flex', gap: 15, flexWrap: 'wrap', justifyContent: 'center'}}>
        <Button big color="red" onClick={leaveRoom}>🚪 Sair</Button>
        <Button big color="green" onClick={()=>{ hasVibratedVictory.current = false; setScreen('lobby'); }}>Voltar ao Lobby</Button>
      </div>
    </div>
  );
  }

  return null;
};

export default ViraVoltaMultiplayer;