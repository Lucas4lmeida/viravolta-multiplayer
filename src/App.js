import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, push, remove, update, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

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
  console.log("Firebase em modo demo");
}

const HAND_SIGNS = {
  0: '✊', 1: '👍', 2: '✌️', 3: '🤟', 4: '🖖', 5: '🖐️',
  6: '🤙', 7: '👉', 8: '✊', 9: '👇', 10: '👆✊',
  11: '👍👍', 12: '👍✌️', 13: '👍🤟', 14: '👍🖖',
  15: '👍🖐️', 16: '👍🤙', 17: '👍👉', 18: '👍✊',
  19: '👍👇', 20: '✌️✊'
};

const PLAYER_COLORS = ['#3498db', '#e74c3c', '#f39c12', '#9b59b6'];
const PLAYER_AVATARS = ['🧑', '👩', '👨', '🧒'];
const TURN_TIME = 30; // segundos por turno

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
  const [justDrew, setJustDrew] = useState(false); // Rastreia se acabou de comprar

  useEffect(() => {
    if (!playerId) {
      const id = 'player_' + Math.random().toString(36).substr(2, 9);
      setPlayerId(id);
    }
  }, []);

  useEffect(() => {
    if (room && database) {
      const roomRef = ref(database, `rooms/${room}`);
      
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          console.log('🔄 Firebase Update - Host:', data.host, '| Meu ID:', playerId);
          setHostId(data.host);
          const playerList = Object.values(data.players || {});
          setPlayers(playerList);
          
          // Resetar justDrew quando não é mais meu turno
          if (gameState && data.gameState && data.gameState.currentPlayerId !== playerId && gameState.currentPlayerId === playerId) {
            setJustDrew(false);
          }
          
          setGameState(data.gameState || null);
          
          if (data.players && data.players[playerId]) {
            setMyHand(data.players[playerId].hand || []);
          }

          // REDIRECIONAR TODOS PARA TELA DE JOGO quando gameState.started = true
          if (data.gameState && data.gameState.started && !data.gameState.ended && screen === 'lobby') {
            console.log('🎮 Jogo iniciado! Mudando para tela de jogo...');
            setScreen('game');
          }

          // REDIRECIONAR PARA GAME OVER quando alguém vence
          if (data.gameState && data.gameState.ended && screen === 'game') {
            console.log('🏆 Jogo finalizado! Mudando para game over...');
            setScreen('gameOver');
          }

          // VOLTAR PARA LOBBY quando gameState é resetado (null)
          if (!data.gameState && (screen === 'game' || screen === 'gameOver')) {
            console.log('🔄 Voltando para lobby...');
            setScreen('lobby');
            setMessage('');
          }

          // Verificar se ficou sozinho durante o jogo
          if (data.gameState && data.gameState.started && playerList.length < 2) {
            setMessage('⚠️ Jogo pausado - aguardando mais jogadores...');
          }
        } else {
          // Sala foi deletada
          console.log('❌ Sala deletada');
          setScreen('menu');
          setRoom(null);
        }
      });

      return () => unsubscribe();
    }
  }, [room, playerId, screen, gameState]);

  // Timer do turno
  useEffect(() => {
    if (gameState && gameState.started && !gameState.ended) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
        const remaining = TURN_TIME - elapsed;
        
        setTimeLeft(Math.max(0, remaining));
        
        if (remaining <= 0 && gameState.currentPlayerId === playerId) {
          // Tempo esgotado - compra automática
          drawCard();
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [gameState, playerId]);

  const createDeck = () => {
    const newDeck = [];
    
    // Cartas numéricas (0-20)
    for (let i = 0; i <= 20; i++) {
      const color = i % 2 === 0 ? 'red' : 'green';
      const parity = i % 2 === 0 ? 'PAR' : 'ÍMPAR';
      const card = {
        id: `num_${i}_${Math.random()}`,
        value: i,
        type: 'number',
        color,
        symbol: HAND_SIGNS[i] || '👋',
        label: parity
      };
      newDeck.push(card);
      if (i <= 10) newDeck.push({...card, id: `num_${i}_${Math.random()}_2`});
    }

    // Cartas de símbolo (cor neutra)
    ['>', '<', '='].forEach(symbol => {
      for (let i = 0; i < 4; i++) {
        newDeck.push({
          id: `sym_${symbol}_${i}`,
          value: symbol,
          type: 'symbol',
          color: 'gray',
          symbol,
          label: symbol === '>' ? 'MAIOR' : symbol === '<' ? 'MENOR' : 'IGUAL'
        });
      }
    });

    // Cartas de compra (+2 e +4)
    ['+2', '+4'].forEach(action => {
      for (let i = 0; i < 2; i++) {
        newDeck.push({
          id: `act_${action}_${i}`,
          value: action,
          type: 'action',
          color: 'black',
          symbol: action,
          label: 'COMPRAR'
        });
      }
    });

    // Cartas reverse (com cor para definir par/ímpar)
    for (let i = 0; i < 3; i++) {
      newDeck.push({
        id: `rev_${i}`,
        value: '↻',
        type: 'reverse',
        color: i % 2 === 0 ? 'red' : 'green',
        symbol: '🔄',
        label: i % 2 === 0 ? 'REVERSE PAR' : 'REVERSE ÍMPAR'
      });
    }

    return shuffle(newDeck);
  };

  const shuffle = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const createRoom = async () => {
    if (!playerName.trim()) {
      alert('Digite seu nome!');
      return;
    }

    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    setRoomCode(code);
    
    if (database) {
      const roomRef = ref(database, `rooms/${code}`);
      await set(roomRef, {
        host: playerId, // HOST FIXO
        players: {
          [playerId]: {
            id: playerId,
            name: playerName,
            hand: [],
            ready: false,
            color: PLAYER_COLORS[0],
            avatar: PLAYER_AVATARS[0],
            joinOrder: 0
          }
        },
        gameState: null,
        createdAt: Date.now()
      });
      console.log('✅ Sala criada! Host:', playerId);
    }
    
    setRoom(code);
    setScreen('lobby');
    setMessage(`Sala criada! Código: ${code}`);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) {
      alert('Digite seu nome e o código da sala!');
      return;
    }

    if (database) {
      const roomRef = ref(database, `rooms/${roomCode.toUpperCase()}`);
      const snapshot = await get(roomRef);
      
      const data = snapshot.val();
      if (data) {
        console.log('🚪 Entrando na sala. Host atual:', data.host);
        const playerCount = Object.keys(data.players || {}).length;
        if (playerCount >= 4) {
          alert('Sala cheia! (máximo 4 jogadores)');
          return;
        }

        const playerIndex = playerCount;
        await update(ref(database, `rooms/${roomCode.toUpperCase()}/players/${playerId}`), {
          id: playerId,
          name: playerName,
          hand: [],
          ready: false,
          color: PLAYER_COLORS[playerIndex],
          avatar: PLAYER_AVATARS[playerIndex],
          joinOrder: playerCount
        });

        console.log('✅ Entrei na sala! Meu ID:', playerId, '| joinOrder:', playerCount);
        setRoom(roomCode.toUpperCase());
        setScreen('lobby');
        setMessage('Você entrou na sala!');
      } else {
        alert('Sala não encontrada!');
      }
    }
  };

  const toggleReady = async () => {
    if (database && room) {
      const playerRef = ref(database, `rooms/${room}/players/${playerId}`);
      const snapshot = await get(playerRef);
      const player = snapshot.val();
      await update(playerRef, { ready: !player.ready });
    }
  };

  const startGame = async () => {
    if (!database || !room) return;

    const roomRef = ref(database, `rooms/${room}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();
    const playerList = Object.values(data.players || {});
    
    if (playerList.length < 2) {
      alert('Precisa de pelo menos 2 jogadores!');
      return;
    }

    if (!playerList.every(p => p.ready)) {
      alert('Todos os jogadores precisam estar prontos!');
      return;
    }

    const deck = createDeck();
    const hands = {};
    
    playerList.forEach(player => {
      hands[player.id] = [];
      for (let i = 0; i < 5; i++) {
        hands[player.id].push(deck.pop());
      }
    });

    // Primeira carta do descarte
    let firstCard = deck.pop();
    // Garantir que primeira carta seja numérica
    while (firstCard.type !== 'number') {
      deck.unshift(firstCard);
      firstCard = deck.pop();
    }

    const initialState = {
      deck: deck,
      discardPile: [firstCard],
      currentPlayerIndex: 0,
      currentPlayerId: playerList[0].id,
      diceResult: null,
      direction: 1,
      playerOrder: playerList.map(p => p.id),
      started: true,
      ended: false,
      turnStartTime: Date.now(),
      activeRule: null, // Para cartas especiais que definem regra sem dado
      mustDraw: 0, // Contador de cartas para comprar obrigatório
      requiredParity: null // 'par' ou 'impar' quando definido por carta especial
    };

    // Atualizar mãos
    playerList.forEach(player => {
      update(ref(database, `rooms/${room}/players/${player.id}`), {
        hand: hands[player.id]
      });
    });

    await update(roomRef, { gameState: initialState });
    // Screen será mudado automaticamente pelo useEffect quando detectar gameState.started = true
  };

  const rollDice = async () => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) return;
    if (gameState.diceResult || gameState.activeRule) return;

    setRolling(true);
    
    setTimeout(async () => {
      const result = ['>', '<', '='][Math.floor(Math.random() * 3)];
      
      await update(ref(database, `rooms/${room}/gameState`), {
        diceResult: result
      });
      
      setRolling(false);
      setMessage(`Dado: ${result}. Jogue uma carta ou compre!`);
    }, 500);
  };

  const canPlayCard = (card) => {
    if (!gameState) return false;
    
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    // Se há cartas para comprar obrigatórias, só pode jogar carta de compra
    if (gameState.mustDraw > 0) {
      return card.type === 'action';
    }

    // Cartas de símbolo e ação sempre podem ser jogadas
    if (card.type === 'symbol' || card.type === 'action') return true;
    
    if (card.type === 'reverse') {
      // Reverse precisa combinar cor com carta anterior
      return card.color === topCard.color;
    }
    
    // Para cartas numéricas
    if (card.type === 'number') {
      // Se há regra ativa completa de carta especial (símbolo + número)
      if (gameState.activeRule && gameState.activeRule.symbol && gameState.activeRule.value !== undefined) {
        const ruleSymbol = gameState.activeRule.symbol;
        const ruleValue = gameState.activeRule.value;
        const requiredParity = gameState.activeRule.parity;

        // Verificar paridade
        const cardParity = card.value % 2 === 0 ? 'par' : 'impar';
        if (cardParity !== requiredParity) return false;

        // Aplicar regra do símbolo
        if (ruleSymbol === '>') return card.value > ruleValue;
        if (ruleSymbol === '<') return card.value < ruleValue;
        if (ruleSymbol === '=') return card.value === ruleValue;
      }
      
      // Se só há paridade definida (por reverse ou símbolo sem número base)
      if (gameState.requiredParity && !gameState.activeRule) {
        const cardParity = card.value % 2 === 0 ? 'par' : 'impar';
        return cardParity === gameState.requiredParity;
      }
      
      // Se tem dado rolado (jogo normal com carta numérica anterior)
      if (gameState.diceResult && topCard.type === 'number') {
        if (gameState.diceResult === '>') return card.value > topCard.value;
        if (gameState.diceResult === '<') return card.value < topCard.value;
        if (gameState.diceResult === '=') return card.value === topCard.value;
      }
      
      // Se tem dado mas topCard não é numérica, apenas verificar paridade se houver
      if (gameState.diceResult && gameState.requiredParity) {
        const cardParity = card.value % 2 === 0 ? 'par' : 'impar';
        return cardParity === gameState.requiredParity;
      }
    }
    
    return false;
  };

  const playCard = async (cardIndex) => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) return;

    const card = myHand[cardIndex];
    if (!canPlayCard(card)) {
      setMessage('❌ Carta inválida!');
      return;
    }

    setJustDrew(false); // Resetar ao jogar

    const newHand = [...myHand];
    newHand.splice(cardIndex, 1);
    
    const newDiscardPile = [...gameState.discardPile, card];
    
    // Atualizar mão
    await update(ref(database, `rooms/${room}/players/${playerId}`), {
      hand: newHand
    });

    // Verificar vitória
    if (newHand.length === 0) {
      await update(ref(database, `rooms/${room}/gameState`), {
        winner: playerId,
        ended: true
      });
      // Screen será mudado automaticamente pelo useEffect
      setMessage('🎉 Você venceu!');
      return;
    }

    let updates = {
      discardPile: newDiscardPile,
      diceResult: null,
      activeRule: null,
      requiredParity: null,
      mustDraw: 0
    };

    let nextPlayerIndex = gameState.currentPlayerIndex;
    let skipTurn = false;

    // CARTA DE SÍMBOLO
    if (card.type === 'symbol') {
      // Procurar última carta numérica na pilha de descarte
      let lastNumCard = null;
      for (let i = gameState.discardPile.length - 1; i >= 0; i--) {
        if (gameState.discardPile[i].type === 'number') {
          lastNumCard = gameState.discardPile[i];
          break;
        }
      }
      
      console.log('🎯 Carta de símbolo jogada:', {
        symbol: card.value,
        lastNumCard: lastNumCard ? `${lastNumCard.value} (${lastNumCard.type})` : 'NENHUMA',
        discardPile: gameState.discardPile.map(c => `${c.value} (${c.type})`)
      });
      
      if (lastNumCard) {
        // Define regra baseada no último número encontrado
        updates.activeRule = {
          symbol: card.value,
          value: lastNumCard.value,
          parity: lastNumCard.value % 2 === 0 ? 'par' : 'impar'
        };
        updates.requiredParity = lastNumCard.value % 2 === 0 ? 'par' : 'impar';
        setMessage(`🎯 Regra: ${card.value} ${lastNumCard.value} e ${updates.requiredParity.toUpperCase()}`);
      } else {
        // Se não há carta numérica na pilha, define apenas paridade baseada no símbolo
        // > = par, < = ímpar, = pode ser qualquer (escolhe par por padrão)
        const defaultParity = card.value === '<' ? 'impar' : 'par';
        updates.requiredParity = defaultParity;
        setMessage(`🎯 Próxima carta deve ser ${defaultParity.toUpperCase()}`);
      }
    }

    // CARTA DE AÇÃO (COMPRA)
    if (card.type === 'action') {
      const amount = parseInt(card.value.replace('+', ''));
      
      // Se há acúmulo prévio
      if (gameState.mustDraw > 0) {
        updates.mustDraw = gameState.mustDraw + amount;
      } else {
        updates.mustDraw = amount;
      }
      
      setMessage(`⚠️ Próximo jogador deve comprar ${updates.mustDraw} cartas!`);
    }

    // CARTA REVERSE
    if (card.type === 'reverse') {
      updates.direction = -gameState.direction;
      updates.requiredParity = card.color === 'red' ? 'par' : 'impar';
      setMessage(`🔄 Sentido invertido! Próxima carta: ${updates.requiredParity.toUpperCase()}`);
    }

    // Passar turno
    nextPlayerIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
    
    updates.currentPlayerIndex = nextPlayerIndex;
    updates.currentPlayerId = gameState.playerOrder[nextPlayerIndex];
    updates.turnStartTime = Date.now();
    updates.deck = gameState.deck;

    await update(ref(database, `rooms/${room}/gameState`), updates);
  };

  const drawCard = async () => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) return;

    let deck = [...gameState.deck];
    
    // Reciclar se necessário
    if (deck.length === 0) {
      const discardPile = [...gameState.discardPile];
      const topCard = discardPile.pop();
      deck = shuffle(discardPile);
      
      await update(ref(database, `rooms/${room}/gameState`), {
        deck: deck,
        discardPile: [topCard]
      });
    }

    // Se é compra obrigatória por carta de ação (+2, +4)
    if (gameState.mustDraw > 0) {
      const amountToDraw = gameState.mustDraw;
      const newHand = [...myHand];

      for (let i = 0; i < amountToDraw && deck.length > 0; i++) {
        newHand.push(deck.pop());
      }

      await update(ref(database, `rooms/${room}/players/${playerId}`), {
        hand: newHand
      });

      // Compra por ação sempre perde o turno
      const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
      
      await update(ref(database, `rooms/${room}/gameState`), {
        deck: deck,
        currentPlayerIndex: nextIndex,
        currentPlayerId: gameState.playerOrder[nextIndex],
        turnStartTime: Date.now(),
        mustDraw: 0,
        diceResult: null,
        activeRule: null,
        requiredParity: null
      });
      
      setMessage(`📥 Você comprou ${amountToDraw} carta(s) por penalidade`);
      return;
    }

    // Compra normal (1 carta)
    if (deck.length === 0) {
      setMessage('❌ Baralho vazio!');
      return;
    }

    const drawnCard = deck.pop();
    const newHand = [...myHand, drawnCard];

    await update(ref(database, `rooms/${room}/players/${playerId}`), {
      hand: newHand
    });

    await update(ref(database, `rooms/${room}/gameState`), {
      deck: deck
    });

    console.log('📥 Comprou carta:', drawnCard, '| Válida?', canPlayCard(drawnCard));

    // Verificar se a carta comprada é jogável
    const isCardPlayable = canPlayCard(drawnCard);
    
    if (isCardPlayable) {
      // Carta é jogável - jogador pode jogar ou passar
      setJustDrew(true);
      setMessage(`📥 Você comprou 1 carta jogável! Jogue ou passe o turno.`);
    } else {
      // Carta não é jogável - passa turno automaticamente
      setMessage(`📥 Você comprou 1 carta não jogável - passando turno...`);
      
      setTimeout(async () => {
        const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
        
        await update(ref(database, `rooms/${room}/gameState`), {
          currentPlayerIndex: nextIndex,
          currentPlayerId: gameState.playerOrder[nextIndex],
          turnStartTime: Date.now(),
          diceResult: null,
          activeRule: null,
          requiredParity: null
        });
      }, 1500); // 1.5s delay para jogador ver a mensagem
    }
  };

  const passTurn = async () => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) return;

    setJustDrew(false); // Resetar ao passar turno

    const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
    
    await update(ref(database, `rooms/${room}/gameState`), {
      currentPlayerIndex: nextIndex,
      currentPlayerId: gameState.playerOrder[nextIndex],
      turnStartTime: Date.now(),
      diceResult: null,
      activeRule: null,
      requiredParity: null
    });
    
    setMessage('⏭️ Você passou o turno');
  };

  const leaveRoom = async () => {
    if (database && room && playerId) {
      const roomRef = ref(database, `rooms/${room}`);
      const snapshot = await get(roomRef);
      const data = snapshot.val();
      
      if (data) {
        const wasHost = data.host === playerId;
        
        // Pegar lista de jogadores ANTES de remover o atual
        const remainingPlayers = Object.values(data.players || {})
          .filter(p => p.id !== playerId)
          .sort((a, b) => a.joinOrder - b.joinOrder);
        
        // Remover jogador
        await remove(ref(database, `rooms/${room}/players/${playerId}`));
        
        // Se era o host E ainda há jogadores, transferir
        if (wasHost && remainingPlayers.length > 0) {
          const newHost = remainingPlayers[0].id;
          await update(roomRef, { host: newHost });
          console.log(`Host transferido para: ${newHost}`);
        } else if (remainingPlayers.length === 0) {
          // Última pessoa saindo - deletar sala
          await remove(roomRef);
        }
        
        // Se estava em jogo e ficou com menos de 2, pausar
        if (data.gameState && data.gameState.started && remainingPlayers.length < 2 && remainingPlayers.length > 0) {
          await update(ref(database, `rooms/${room}/gameState`), {
            paused: true
          });
        }
      }
    }
    
    setScreen('menu');
    setRoom(null);
    setGameState(null);
    setPlayers([]);
    setMyHand([]);
  };

  // COMPONENTES

  const Card = ({ card, onClick, small, disabled, isBack }) => {
    const size = small ? 90 : 120;
    const height = small ? 135 : 180;
    
    if (isBack) {
      return (
        <div style={{
          width: `${size}px`,
          height: `${height}px`,
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #1a1a1a, #000000)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 6px 12px rgba(0,0,0,0.5)',
          border: '3px solid #2d2d2d',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '25px',
            height: '25px',
            borderRadius: '50%',
            background: '#4CAF50'
          }} />
          <div style={{ fontSize: small ? '2em' : '2.5em', marginBottom: '5px' }}>🐊</div>
          <div style={{
            fontSize: small ? '0.6em' : '0.75em',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #4CAF50, #FFC107)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '1px'
          }}>ViraVolta</div>
        </div>
      );
    }

    const getBackground = () => {
      if (card.color === 'red') return 'linear-gradient(145deg, #e74c3c, #c0392b)';
      if (card.color === 'green') return 'linear-gradient(145deg, #2ecc71, #27ae60)';
      if (card.color === 'gray') return 'linear-gradient(145deg, #95a5a6, #7f8c8d)';
      return 'linear-gradient(145deg, #2c3e50, #1a252f)';
    };

    return (
      <div
        onClick={onClick}
        style={{
          width: `${size}px`,
          height: `${height}px`,
          borderRadius: '12px',
          background: getBackground(),
          color: 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s ease',
          boxShadow: disabled ? '0 4px 8px rgba(0,0,0,0.3)' : '0 6px 12px rgba(0,0,0,0.4)',
          position: 'relative',
          border: '2px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
          transform: disabled ? 'none' : 'translateY(0)',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.05)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.4)';
          }
        }}
      >
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          fontSize: small ? '1.2em' : '1.5em',
          fontWeight: 'bold',
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
        }}>
          {card.value}
        </div>

        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          fontSize: small ? '1.2em' : '1.5em',
          fontWeight: 'bold',
          transform: 'rotate(180deg)',
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
        }}>
          {card.value}
        </div>

        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          width: '100%'
        }}>
          <div style={{
            width: small ? '60px' : '75px',
            height: small ? '60px' : '75px',
            borderRadius: '50%',
            background: 'white',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
            position: 'relative'
          }}>
            <div style={{
              fontSize: small ? '1.8em' : '2.2em',
              filter: 'grayscale(0.2)'
            }}>
              {card.symbol}
            </div>

            {(card.type === 'symbol' || card.type === 'action') && (
              <div style={{
                position: 'absolute',
                bottom: '-10px',
                left: '-15px',
                fontSize: small ? '1.2em' : '1.5em',
                transform: card.type === 'symbol' && card.value === '<' ? 'scaleX(-1)' : 'none'
              }}>
                🐊
              </div>
            )}
          </div>

          {card.type === 'action' && (
            <>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: small ? '70px' : '85px',
                height: small ? '70px' : '85px',
                borderRadius: '50%',
                border: '3px solid #4CAF50',
                pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: small ? '78px' : '93px',
                height: small ? '78px' : '93px',
                borderRadius: '50%',
                border: '3px solid #e74c3c',
                pointerEvents: 'none'
              }} />
            </>
          )}
        </div>

        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: small ? '0.5em' : '0.65em',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          opacity: 0.9,
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap'
        }}>
          {card.label}
        </div>
      </div>
    );
  };

  // TELAS

  if (screen === 'menu') {
    return (
      <div style={{
        fontFamily: 'Comic Sans MS, cursive',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        padding: '20px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center'
        }}>
          <h1 style={{
            fontSize: '3em',
            background: 'linear-gradient(45deg, #2ecc71, #f1c40f, #e74c3c)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '10px'
          }}>
            🐊 ViraVolta 🐊
          </h1>
          <p style={{ marginBottom: '30px', fontSize: '1.1em' }}>Modo Multiplayer Online</p>

          <input
            type="text"
            placeholder="Seu nome"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '1.1em',
              borderRadius: '10px',
              border: 'none',
              marginBottom: '20px'
            }}
          />

          <button
            onClick={createRoom}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #27ae60, #229954)',
              color: 'white',
              border: 'none',
              padding: '15px',
              fontSize: '1.2em',
              borderRadius: '10px',
              cursor: 'pointer',
              marginBottom: '15px',
              fontWeight: 'bold'
            }}
          >
            🎮 Criar Sala
          </button>

          <div style={{ margin: '20px 0', opacity: 0.7 }}>- OU -</div>

          <input
            type="text"
            placeholder="Código da sala"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '1.1em',
              borderRadius: '10px',
              border: 'none',
              marginBottom: '15px',
              textTransform: 'uppercase'
            }}
          />

          <button
            onClick={joinRoom}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #3498db, #2980b9)',
              color: 'white',
              border: 'none',
              padding: '15px',
              fontSize: '1.2em',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🚪 Entrar na Sala
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    const isHost = hostId === playerId;
    const myPlayer = players.find(p => p.id === playerId);

    console.log('👥 Lobby State:', {
      hostId,
      playerId,
      isHost,
      players: players.map(p => ({ id: p.id, name: p.name, isHost: p.id === hostId }))
    });

    return (
      <div style={{
        fontFamily: 'Comic Sans MS, cursive',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        padding: '20px',
        color: 'white'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '30px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>Sala: {room}</h2>
          <p style={{ textAlign: 'center', marginBottom: '10px', fontSize: '1.2em' }}>
            Jogadores: {players.length}/4
          </p>
          <p style={{ textAlign: 'center', marginBottom: '30px', fontSize: '0.9em', opacity: 0.7 }}>
            Host atual: {players.find(p => p.id === hostId)?.name || 'Carregando...'}
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            {players.map((player) => (
              <div
                key={player.id}
                style={{
                  background: player.ready ? 'rgba(46, 204, 113, 0.3)' : 'rgba(255,255,255,0.2)',
                  padding: '20px',
                  borderRadius: '15px',
                  textAlign: 'center',
                  border: player.id === playerId ? '3px solid #FFD700' : player.id === hostId ? '2px solid #FFD700' : 'none',
                  position: 'relative'
                }}
              >
                {player.id === hostId && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    background: '#FFD700',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2em',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}>
                    👑
                  </div>
                )}
                <div style={{ fontSize: '3em', marginBottom: '10px' }}>{player.avatar}</div>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{player.name}</div>
                <div style={{
                  fontSize: '0.9em',
                  color: player.ready ? '#2ecc71' : '#e74c3c'
                }}>
                  {player.ready ? '✓ Pronto' : '⏳ Aguardando'}
                </div>
                {player.id === playerId && (
                  <div style={{ fontSize: '0.7em', marginTop: '5px', color: '#FFD700' }}>Você</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={toggleReady}
              style={{
                background: myPlayer?.ready 
                  ? 'linear-gradient(135deg, #e74c3c, #c0392b)' 
                  : 'linear-gradient(135deg, #27ae60, #229954)',
                color: 'white',
                border: 'none',
                padding: '15px 30px',
                fontSize: '1.1em',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {myPlayer?.ready ? '❌ Cancelar' : '✓ Pronto'}
            </button>

            {isHost && (
              <button
                onClick={startGame}
                style={{
                  background: 'linear-gradient(135deg, #3498db, #2980b9)',
                  color: 'white',
                  border: 'none',
                  padding: '15px 30px',
                  fontSize: '1.1em',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  position: 'relative'
                }}
              >
                👑 Iniciar Jogo (Host)
              </button>
            )}

            {!isHost && (
              <div style={{
                padding: '15px 30px',
                fontSize: '0.9em',
                opacity: 0.7,
                textAlign: 'center'
              }}>
                Aguardando host iniciar...
              </div>
            )}

            <button
              onClick={leaveRoom}
              style={{
                background: 'linear-gradient(135deg, #95a5a6, #7f8c8d)',
                color: 'white',
                border: 'none',
                padding: '15px 30px',
                fontSize: '1.1em',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🚪 Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game' && gameState) {
    const currentPlayer = players.find(p => p.id === gameState.currentPlayerId);
    const isMyTurn = gameState.currentPlayerId === playerId;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const needsDice = !gameState.diceResult && !gameState.activeRule && !gameState.requiredParity && topCard.type === 'number';
    const isPaused = players.length < 2;
    
    // Verificar se jogador tem alguma carta válida
    const hasValidCard = isMyTurn && myHand.some(card => canPlayCard(card));
    const mustDrawCard = isMyTurn && !needsDice && !hasValidCard && gameState.mustDraw === 0;
    
    // Debug log
    if (isMyTurn && !hasValidCard && !needsDice) {
      console.log('⚠️ SEM CARTAS VÁLIDAS:', {
        topCard: `${topCard.value} (${topCard.type})`,
        diceResult: gameState.diceResult,
        activeRule: gameState.activeRule,
        requiredParity: gameState.requiredParity,
        mustDraw: gameState.mustDraw,
        myCards: myHand.map(c => `${c.value} ${c.type} (${c.value % 2 === 0 ? 'par' : 'impar'})`),
        validCards: myHand.filter(c => canPlayCard(c)).map(c => `${c.value} ${c.type}`)
      });
    }

    return (
      <div style={{
        fontFamily: 'Comic Sans MS, cursive',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        padding: '20px',
        color: 'white'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '30px'
        }}>
          {/* Info Panel */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '20px',
            gap: '20px',
            flexWrap: 'wrap'
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '15px',
              borderRadius: '10px',
              flex: 1,
              minWidth: '150px'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Turno</h4>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                {currentPlayer?.avatar} {currentPlayer?.name}
              </div>
              {isMyTurn && (
                <div style={{ fontSize: '0.9em', marginTop: '5px', color: '#FFD700' }}>
                  ⏱️ {timeLeft}s
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '15px',
              borderRadius: '10px',
              flex: 1,
              minWidth: '150px'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Regra Ativa</h4>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                {gameState.activeRule && gameState.activeRule.symbol && gameState.activeRule.value !== undefined ? (
                  `${gameState.activeRule.symbol} ${gameState.activeRule.value} (${gameState.activeRule.parity})`
                ) : gameState.requiredParity ? (
                  gameState.requiredParity.toUpperCase()
                ) : gameState.diceResult ? (
                  gameState.diceResult
                ) : (
                  '🎲'
                )}
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '15px',
              borderRadius: '10px',
              flex: 1,
              minWidth: '150px'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Monte</h4>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                🃏 {gameState.deck.length}
              </div>
            </div>

            {gameState.mustDraw > 0 && (
              <div style={{
                background: 'rgba(231, 76, 60, 0.4)',
                padding: '15px',
                borderRadius: '10px',
                flex: 1,
                minWidth: '150px',
                border: '2px solid #e74c3c'
              }}>
                <h4 style={{ margin: '0 0 8px 0' }}>⚠️ Compra Obrigatória</h4>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                  +{gameState.mustDraw}
                </div>
              </div>
            )}
          </div>

          {isPaused && (
            <div style={{
              background: 'rgba(231, 76, 60, 0.8)',
              padding: '20px',
              borderRadius: '15px',
              textAlign: 'center',
              marginBottom: '20px',
              fontSize: '1.2em',
              fontWeight: 'bold'
            }}>
              ⏸️ JOGO PAUSADO - Aguardando mais jogadores (mínimo 2)
            </div>
          )}

          {/* Outros jogadores */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            {players.filter(p => p.id !== playerId).map(player => (
              <div
                key={player.id}
                style={{
                  background: player.id === gameState.currentPlayerId 
                    ? 'rgba(255, 215, 0, 0.3)' 
                    : 'rgba(255,255,255,0.2)',
                  padding: '15px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: player.id === gameState.currentPlayerId ? '2px solid #FFD700' : 'none'
                }}
              >
                <div style={{ fontSize: '2em' }}>{player.avatar}</div>
                <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                <div style={{ fontSize: '1.2em', marginTop: '5px' }}>
                  🃏 {player.hand?.length || 0}
                </div>
              </div>
            ))}
          </div>

          {/* Área central */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '30px',
            margin: '30px 0',
            minHeight: '200px'
          }}>
            <Card card={{}} isBack />

            <div
              onClick={isMyTurn && needsDice && !isPaused ? rollDice : null}
              style={{
                width: '110px',
                height: '110px',
                background: 'linear-gradient(145deg, #ffffff, #e0e0e0)',
                borderRadius: '20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: '3.5em',
                color: '#333',
                cursor: isMyTurn && needsDice && !isPaused ? 'pointer' : 'not-allowed',
                boxShadow: '0 10px 20px rgba(0,0,0,0.25)',
                animation: rolling ? 'spin 0.5s ease-in-out' : 'none',
                border: '4px solid #ddd',
                opacity: !isMyTurn || !needsDice || isPaused ? 0.5 : 1
              }}
            >
              {gameState.diceResult || gameState.activeRule?.symbol || '🎲'}
            </div>

            {topCard && <Card card={topCard} />}
          </div>

          {/* Minha mão */}
          <div>
            <h3 style={{ textAlign: 'center', marginBottom: '15px' }}>
              Sua Mão ({myHand.length})
              {mustDrawCard && !justDrew && (
                <span style={{ 
                  marginLeft: '10px', 
                  fontSize: '0.7em', 
                  color: '#e74c3c',
                  background: 'rgba(231, 76, 60, 0.2)',
                  padding: '5px 10px',
                  borderRadius: '5px'
                }}>
                  ⚠️ Sem cartas válidas - COMPRE!
                </span>
              )}
              {justDrew && (
                <span style={{ 
                  marginLeft: '10px', 
                  fontSize: '0.7em', 
                  color: '#f39c12',
                  background: 'rgba(243, 156, 18, 0.2)',
                  padding: '5px 10px',
                  borderRadius: '5px'
                }}>
                  📥 Comprou! Jogue ou passe
                </span>
              )}
            </h3>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              minHeight: '150px'
            }}>
              {myHand.map((card, i) => {
                const playable = canPlayCard(card) && !isPaused;
                return (
                  <div
                    key={card.id}
                    style={{
                      position: 'relative',
                      animation: playable && isMyTurn ? 'pulse 1.5s ease-in-out infinite' : 'none'
                    }}
                  >
                    {playable && isMyTurn && (
                      <div style={{
                        position: 'absolute',
                        top: '-5px',
                        left: '-5px',
                        right: '-5px',
                        bottom: '-5px',
                        borderRadius: '15px',
                        border: '3px solid #FFD700',
                        boxShadow: '0 0 20px rgba(255, 215, 0, 0.6)',
                        pointerEvents: 'none',
                        zIndex: 0
                      }} />
                    )}
                    <Card
                      card={card}
                      small
                      disabled={!playable || !isMyTurn || isPaused}
                      onClick={() => isMyTurn && !isPaused && playCard(i)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controles */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '15px',
            marginTop: '25px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={rollDice}
              disabled={rolling || !needsDice || !isMyTurn || isPaused}
              style={{
                background: rolling || !needsDice || !isMyTurn || isPaused
                  ? 'linear-gradient(135deg, #95a5a6, #7f8c8d)' 
                  : 'linear-gradient(135deg, #3498db, #2980b9)',
                color: 'white',
                border: 'none',
                padding: '14px 35px',
                fontSize: '1.1em',
                borderRadius: '30px',
                cursor: rolling || !needsDice || !isMyTurn || isPaused ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              🎲 Rolar Dado
            </button>

            {!justDrew && (
              <button
                onClick={drawCard}
                disabled={!isMyTurn || isPaused}
                style={{
                  background: !isMyTurn || isPaused
                    ? 'linear-gradient(135deg, #95a5a6, #7f8c8d)' 
                    : mustDrawCard || gameState.mustDraw > 0
                    ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
                    : 'linear-gradient(135deg, #e67e22, #d35400)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 35px',
                  fontSize: '1.1em',
                  borderRadius: '30px',
                  cursor: !isMyTurn || isPaused ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  boxShadow: mustDrawCard || gameState.mustDraw > 0 ? '0 0 20px rgba(231, 76, 60, 0.6)' : 'none',
                  animation: mustDrawCard || gameState.mustDraw > 0 ? 'pulse 1s ease-in-out infinite' : 'none'
                }}
              >
                {gameState.mustDraw > 0 ? `⚠️ Comprar ${gameState.mustDraw}` : mustDrawCard ? '⚠️ Comprar 1 (Obrigatório)' : '🃏 Comprar 1'}
              </button>
            )}

            {justDrew && (
              <button
                onClick={passTurn}
                disabled={!isMyTurn || isPaused}
                style={{
                  background: !isMyTurn || isPaused
                    ? 'linear-gradient(135deg, #95a5a6, #7f8c8d)' 
                    : 'linear-gradient(135deg, #f39c12, #e67e22)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 35px',
                  fontSize: '1.1em',
                  borderRadius: '30px',
                  cursor: !isMyTurn || isPaused ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  boxShadow: '0 0 20px rgba(243, 156, 18, 0.6)',
                  animation: 'pulse 1s ease-in-out infinite'
                }}
              >
                ⏭️ Passar Turno
              </button>
            )}

            <button
              onClick={leaveRoom}
              style={{
                background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                color: 'white',
                border: 'none',
                padding: '14px 35px',
                fontSize: '1.1em',
                borderRadius: '30px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🚪 Sair
            </button>
          </div>

          {/* Mensagem */}
          {message && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              color: '#333',
              padding: '15px',
              borderRadius: '10px',
              textAlign: 'center',
              marginTop: '20px',
              fontSize: '1.1em'
            }}>
              {message}
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(90deg); }
            50% { transform: rotate(180deg); }
            75% { transform: rotate(270deg); }
          }
          
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  if (screen === 'gameOver' && gameState) {
    const winner = players.find(p => p.id === gameState.winner);
    
    const restartGame = async () => {
      if (database && room) {
        // Resetar gameState e voltar para lobby
        await update(ref(database, `rooms/${room}`), {
          gameState: null
        });
        
        // Resetar ready de todos os jogadores
        const updates = {};
        players.forEach(player => {
          updates[`players/${player.id}/ready`] = false;
          updates[`players/${player.id}/hand`] = [];
        });
        await update(ref(database, `rooms/${room}`), updates);
        
        setScreen('lobby');
        setMessage('');
      }
    };
    
    return (
      <div style={{
        fontFamily: 'Comic Sans MS, cursive',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        padding: '20px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '50px',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <h1 style={{ fontSize: '3em', marginBottom: '20px' }}>🎉 Fim de Jogo! 🎉</h1>
          <div style={{ fontSize: '4em', marginBottom: '20px' }}>{winner?.avatar}</div>
          <h2 style={{ fontSize: '2em', marginBottom: '30px' }}>
            {winner?.name} Venceu!
          </h2>
          
          {hostId === playerId && (
            <button
              onClick={restartGame}
              style={{
                background: 'linear-gradient(135deg, #27ae60, #229954)',
                color: 'white',
                border: 'none',
                padding: '15px 40px',
                fontSize: '1.2em',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginRight: '15px'
              }}
            >
              🔄 Novo Jogo
            </button>
          )}

          <button
            onClick={leaveRoom}
            style={{
              background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
              color: 'white',
              border: 'none',
              padding: '15px 40px',
              fontSize: '1.2em',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🚪 Sair
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default ViraVoltaMultiplayer;
