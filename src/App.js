import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

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

const ViraVoltaMultiplayer = () => {
  // Estados de UI
  const [screen, setScreen] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  
  // Estados do jogo
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [message, setMessage] = useState('');
  const [rolling, setRolling] = useState(false);
  
  // Estados para modal de paridade
  const [showParityModal, setShowParityModal] = useState(false);
  const [pendingCardPlay, setPendingCardPlay] = useState(null);

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
          setPlayers(Object.values(data.players || {}));
          setGameState(data.gameState || null);
          
          if (data.gameState && data.players && data.players[playerId]) {
            setMyHand(data.players[playerId].hand || []);
          }
        }
      });

      return () => unsubscribe();
    }
  }, [room, playerId]);

  // Avisar sobre compra pendente
  useEffect(() => {
    if (gameState && gameState.pendingDrawCards > 0 && gameState.currentPlayerId === playerId) {
      setMessage(`⚠️ Você deve comprar ${gameState.pendingDrawCards} carta(s)! Clique em "Comprar".`);
    }
  }, [gameState?.pendingDrawCards, gameState?.currentPlayerId, playerId]);

  const createDeck = () => {
    const newDeck = [];
    
    // Cartas numéricas 0-20
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

    // Cartas de símbolo (>, <, =)
    ['>', '<', '='].forEach(symbol => {
      for (let i = 0; i < 4; i++) {
        newDeck.push({
          id: `sym_${symbol}_${i}`,
          value: symbol,
          type: 'symbol',
          color: i % 2 === 0 ? 'red' : 'green',
          symbol,
          label: symbol === '>' ? 'MAIOR' : symbol === '<' ? 'MENOR' : 'IGUAL'
        });
      }
    });

    // Cartas de ação (+1, +2, +4)
    ['+1', '+2', '+4'].forEach(action => {
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

    // Cartas reverse
    for (let i = 0; i < 3; i++) {
      newDeck.push({
        id: `rev_${i}`,
        value: '↻',
        type: 'reverse',
        color: i % 2 === 0 ? 'red' : 'green',
        symbol: '🔄',
        label: 'REVERSE'
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
        host: playerId,
        players: {
          [playerId]: {
            id: playerId,
            name: playerName,
            hand: [],
            ready: false,
            color: PLAYER_COLORS[0],
            avatar: PLAYER_AVATARS[0]
          }
        },
        gameState: null,
        createdAt: Date.now()
      });
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
      
      onValue(roomRef, (snap) => {
        const data = snap.val();
        if (data) {
          const playerCount = Object.keys(data.players || {}).length;
          if (playerCount >= 4) {
            alert('Sala cheia! (máximo 4 jogadores)');
            return;
          }

          const playerIndex = playerCount;
          update(ref(database, `rooms/${roomCode.toUpperCase()}/players/${playerId}`), {
            id: playerId,
            name: playerName,
            hand: [],
            ready: false,
            color: PLAYER_COLORS[playerIndex],
            avatar: PLAYER_AVATARS[playerIndex]
          });

          setRoom(roomCode.toUpperCase());
          setScreen('lobby');
          setMessage('Você entrou na sala!');
        } else {
          alert('Sala não encontrada!');
        }
      }, { onlyOnce: true });
    } else {
      setRoom(roomCode.toUpperCase());
      setScreen('lobby');
    }
  };

  const toggleReady = async () => {
    if (database && room) {
      const playerRef = ref(database, `rooms/${room}/players/${playerId}`);
      onValue(playerRef, (snap) => {
        const player = snap.val();
        if (player) {
          update(playerRef, { ready: !player.ready });
        }
      }, { onlyOnce: true });
    }
  };

  const startGame = async () => {
    if (!database || !room) return;

    const roomRef = ref(database, `rooms/${room}`);
    onValue(roomRef, (snap) => {
      const data = snap.val();
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
      
      // Distribuir 5 cartas para cada jogador
      playerList.forEach(player => {
        hands[player.id] = [];
        for (let i = 0; i < 5; i++) {
          hands[player.id].push(deck.pop());
        }
      });

      // IMPORTANTE: Garantir que carta inicial seja numérica
      let firstCard;
      do {
        firstCard = deck.pop();
      } while (firstCard && firstCard.type !== 'number');

      if (!firstCard) {
        firstCard = deck.pop(); // Fallback improvável
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
        turnStartTime: Date.now(),
        // Novos campos para lógica correta
        nextCardParity: null,  // 'par' ou 'impar'
        skipDiceRoll: false,   // true quando carta especial define regra
        pendingDrawCards: 0    // quantidade de cartas que próximo deve comprar
      };

      // Atualizar mãos dos jogadores
      playerList.forEach(player => {
        update(ref(database, `rooms/${room}/players/${player.id}`), {
          hand: hands[player.id]
        });
      });

      update(roomRef, { gameState: initialState });
      setScreen('game');
    }, { onlyOnce: true });
  };

  const rollDice = async () => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) return;
    if (gameState.diceResult) return;
    if (gameState.skipDiceRoll) return; // Não pode rolar se carta especial já definiu regra

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
    
    // REGRA 1: Se há compra pendente, só pode comprar (não pode jogar)
    if (gameState.pendingDrawCards > 0) {
      return false;
    }
    
    // REGRA 2: Cartas de AÇÃO podem ser jogadas a qualquer momento
    if (card.type === 'action') {
      return true;
    }
    
    // REGRA 3: Cartas de SÍMBOLO podem ser jogadas a qualquer momento
    if (card.type === 'symbol') {
      return true;
    }
    
    // REGRA 4: Cartas REVERSE só se a COR bater
    if (card.type === 'reverse') {
      return card.color === topCard.color;
    }
    
    // REGRA 5: Cartas NUMÉRICAS - lógica complexa
    if (card.type === 'number') {
      
      // Caso 5.1: Há escolha de PARIDADE ativa
      if (gameState.nextCardParity) {
        const isPar = card.value % 2 === 0;
        const expectedParity = gameState.nextCardParity === 'par';
        const matchesParity = isPar === expectedParity;
        
        if (!matchesParity) {
          return false;
        }
        
        // Se paridade bate, verificar regra do dado (se houver)
        if (gameState.diceResult && topCard.type === 'number') {
          if (gameState.diceResult === '>') return card.value > topCard.value;
          if (gameState.diceResult === '<') return card.value < topCard.value;
          if (gameState.diceResult === '=') return card.value === topCard.value;
        }
        
        // Se só tem paridade (sem dado), está OK
        return true;
      }
      
      // Caso 5.2: Há resultado de DADO
      if (gameState.diceResult && topCard.type === 'number') {
        if (gameState.diceResult === '>') return card.value > topCard.value;
        if (gameState.diceResult === '<') return card.value < topCard.value;
        if (gameState.diceResult === '=') return card.value === topCard.value;
      }
      
      // Caso 5.3: Sem dado e sem paridade - não pode jogar
      return false;
    }
    
    return false;
  };

  const playCard = async (cardIndex) => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) {
      setMessage('❌ Não é seu turno!');
      return;
    }

    const card = myHand[cardIndex];
    if (!canPlayCard(card)) {
      setMessage('❌ Carta inválida! Verifique as regras.');
      return;
    }

    // Cartas especiais requerem escolha de paridade
    if (card.type === 'action' || card.type === 'symbol') {
      setPendingCardPlay({ card, cardIndex });
      setShowParityModal(true);
      return;
    }

    // Cartas normais executam direto
    await executeCardPlay(card, cardIndex, null);
  };

  const executeCardPlay = async (card, cardIndex, parityChoice) => {
    const newHand = [...myHand];
    newHand.splice(cardIndex, 1);
    
    const newDiscardPile = [...gameState.discardPile, card];
    
    // Atualizar mão do jogador
    await update(ref(database, `rooms/${room}/players/${playerId}`), {
      hand: newHand
    });

    // Verificar vitória
    if (newHand.length === 0) {
      await update(ref(database, `rooms/${room}/gameState`), {
        winner: playerId,
        ended: true
      });
      setScreen('gameOver');
      return;
    }

    // Preparar updates
    let updates = {
      discardPile: newDiscardPile,
      diceResult: null,
      nextCardParity: null,
      skipDiceRoll: false,
      pendingDrawCards: 0
    };

    let deckCopy = [...gameState.deck]; // IMPORTANTE: Criar cópia!

    // CARTA DE AÇÃO (+1, +2, +4)
    if (card.type === 'action') {
      const amount = parseInt(card.value.replace('+', ''));
      const nextPlayerIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
      const nextPlayerId = gameState.playerOrder[nextPlayerIndex];
      
      updates.pendingDrawCards = amount;
      updates.nextCardParity = parityChoice;
      updates.skipDiceRoll = true;
      
      // Comprar cartas do deck
      const cardsToAdd = [];
      for (let i = 0; i < amount && deckCopy.length > 0; i++) {
        cardsToAdd.push(deckCopy.pop());
      }
      
      updates.deck = deckCopy;
      
      // Atualizar mão do próximo jogador
      onValue(ref(database, `rooms/${room}/players/${nextPlayerId}`), (snap) => {
        const nextPlayer = snap.val();
        if (nextPlayer) {
          update(ref(database, `rooms/${room}/players/${nextPlayerId}`), {
            hand: [...(nextPlayer.hand || []), ...cardsToAdd]
          });
        }
      }, { onlyOnce: true });
    }

    // CARTA DE SÍMBOLO (>, <, =)
    if (card.type === 'symbol') {
      updates.diceResult = card.value;
      updates.nextCardParity = parityChoice;
      updates.skipDiceRoll = true;
    }

    // CARTA REVERSE
    if (card.type === 'reverse') {
      updates.direction = -gameState.direction;
      // Paridade baseada na cor: Verde = ímpar, Vermelho = par
      updates.nextCardParity = card.color === 'green' ? 'impar' : 'par';
      updates.skipDiceRoll = true;
    }

    // CARTA NUMÉRICA
    if (card.type === 'number') {
      updates.nextCardParity = null;
      updates.skipDiceRoll = false;
    }

    // Passar turno
    const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
    updates.currentPlayerIndex = nextIndex;
    updates.currentPlayerId = gameState.playerOrder[nextIndex];
    updates.turnStartTime = Date.now();

    await update(ref(database, `rooms/${room}/gameState`), updates);
    setMessage('✅ Carta jogada!');
  };

  const handleParityChoice = async (parity) => {
    setShowParityModal(false);
    if (pendingCardPlay) {
      await executeCardPlay(
        pendingCardPlay.card,
        pendingCardPlay.cardIndex,
        parity
      );
      setPendingCardPlay(null);
    }
  };

  const drawCard = async () => {
    if (!database || !room || !gameState) return;
    if (gameState.currentPlayerId !== playerId) {
      setMessage('❌ Não é seu turno!');
      return;
    }
    
    // CASO 1: Compra obrigatória
    if (gameState.pendingDrawCards > 0) {
      const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
      
      await update(ref(database, `rooms/${room}/gameState`), {
        pendingDrawCards: 0,
        currentPlayerIndex: nextIndex,
        currentPlayerId: gameState.playerOrder[nextIndex],
        turnStartTime: Date.now()
      });
      
      setMessage('✅ Cartas compradas, turno passado');
      return;
    }
    
    // CASO 2: Compra voluntária
    if (!gameState.diceResult && !gameState.skipDiceRoll) {
      setMessage('❌ Role o dado primeiro!');
      return;
    }

    if (gameState.deck.length === 0) {
      setMessage('❌ Baralho vazio! Passando turno...');
      const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
      
      await update(ref(database, `rooms/${room}/gameState`), {
        diceResult: null,
        nextCardParity: null,
        skipDiceRoll: false,
        currentPlayerIndex: nextIndex,
        currentPlayerId: gameState.playerOrder[nextIndex],
        turnStartTime: Date.now()
      });
      return;
    }

    const newDeck = [...gameState.deck];
    const card = newDeck.pop();
    const newHand = [...myHand, card];

    await update(ref(database, `rooms/${room}/players/${playerId}`), {
      hand: newHand
    });

    const nextIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.playerOrder.length) % gameState.playerOrder.length;
    
    await update(ref(database, `rooms/${room}/gameState`), {
      deck: newDeck, // IMPORTANTE: Salvar deck atualizado!
      diceResult: null,
      nextCardParity: null,
      skipDiceRoll: false,
      currentPlayerIndex: nextIndex,
      currentPlayerId: gameState.playerOrder[nextIndex],
      turnStartTime: Date.now()
    });

    setMessage('✅ Você comprou uma carta');
  };

  const leaveRoom = async () => {
    if (database && room && playerId) {
      await remove(ref(database, `rooms/${room}/players/${playerId}`));
    }
    setScreen('menu');
    setRoom(null);
    setGameState(null);
    setPlayers([]);
    setMessage('');
  };

  // === COMPONENTES ===

  const ParityChoiceModal = ({ onChoice, cardPlayed }) => {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          maxWidth: '450px',
          color: '#333',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '15px' }}>🐊</div>
          <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>
            Escolha a Próxima Carta
          </h2>
          <p style={{ marginBottom: '30px', fontSize: '1.1em', lineHeight: '1.5' }}>
            Você jogou <strong>{cardPlayed.label}</strong>.
            <br/>
            Escolha se a próxima carta deve ser:
          </p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button
              onClick={() => onChoice('par')}
              style={{
                background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                color: 'white',
                border: 'none',
                padding: '20px 40px',
                fontSize: '1.3em',
                borderRadius: '15px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              🔴 PAR
            </button>
            <button
              onClick={() => onChoice('impar')}
              style={{
                background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
                color: 'white',
                border: 'none',
                padding: '20px 40px',
                fontSize: '1.3em',
                borderRadius: '15px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              🟢 ÍMPAR
            </button>
          </div>
        </div>
      </div>
    );
  };

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
      return 'linear-gradient(145deg, #2c3e50, #1a252f)';
    };

    return (
      <div
        onClick={disabled ? null : onClick}
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

  // === TELAS ===

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
              marginBottom: '20px',
              boxSizing: 'border-box'
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
              textTransform: 'uppercase',
              boxSizing: 'border-box'
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
    const isHost = room && players.length > 0 && players[0].id === playerId;
    const myPlayer = players.find(p => p.id === playerId);

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
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Sala: {room}</h2>
          <p style={{ textAlign: 'center', marginBottom: '30px', fontSize: '1.2em' }}>
            Jogadores: {players.length}/4
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            {players.map((player, index) => (
              <div
                key={player.id}
                style={{
                  background: player.ready ? 'rgba(46, 204, 113, 0.3)' : 'rgba(255,255,255,0.2)',
                  padding: '20px',
                  borderRadius: '15px',
                  textAlign: 'center',
                  border: player.id === playerId ? '3px solid #FFD700' : 'none'
                }}
              >
                <div style={{ fontSize: '3em', marginBottom: '10px' }}>{player.avatar}</div>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{player.name}</div>
                <div style={{
                  fontSize: '0.9em',
                  color: player.ready ? '#2ecc71' : '#e74c3c'
                }}>
                  {player.ready ? '✓ Pronto' : '⏳ Aguardando'}
                </div>
                {index === 0 && <div style={{ fontSize: '0.8em', marginTop: '5px' }}>👑 Host</div>}
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
                  fontWeight: 'bold'
                }}
              >
                🎮 Iniciar Jogo
              </button>
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

          {message && (
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '15px',
              borderRadius: '10px',
              textAlign: 'center',
              marginTop: '20px'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'game' && gameState) {
    const currentPlayer = players.find(p => p.id === gameState.currentPlayerId);
    const isMyTurn = gameState.currentPlayerId === playerId;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

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
          padding: '25px'
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
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '15px',
              borderRadius: '10px',
              flex: 1,
              minWidth: '150px'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Regra</h4>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                {gameState.nextCardParity ? (
                  <>
                    {gameState.nextCardParity === 'par' ? '🔴 PAR' : '🟢 ÍMPAR'}
                  </>
                ) : (
                  gameState.diceResult ? gameState.diceResult : '🎲'
                )}
              </div>
              {gameState.skipDiceRoll && (
                <div style={{ fontSize: '0.7em', marginTop: '5px', opacity: 0.8 }}>
                  (Sem dado)
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
              <h4 style={{ margin: '0 0 8px 0' }}>Monte</h4>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                {gameState.deck.length} 🃏
              </div>
            </div>
          </div>

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
            minHeight: '200px',
            flexWrap: 'wrap'
          }}>
            <Card card={{}} isBack />

            <div
              onClick={isMyTurn && !gameState.skipDiceRoll ? rollDice : null}
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
                cursor: isMyTurn && !gameState.diceResult && !gameState.skipDiceRoll ? 'pointer' : 'not-allowed',
                boxShadow: '0 10px 20px rgba(0,0,0,0.25)',
                animation: rolling ? 'spin 0.5s ease-in-out' : 'none',
                border: '4px solid #ddd',
                opacity: !isMyTurn || gameState.skipDiceRoll ? 0.5 : 1
              }}
            >
              {gameState.skipDiceRoll ? '⏭️' : (gameState.diceResult || '🎲')}
            </div>

            {topCard && <Card card={topCard} />}
          </div>

          {/* Minha mão */}
          <div>
            <h3 style={{ textAlign: 'center', marginBottom: '15px' }}>
              Sua Mão {isMyTurn && '(Seu turno!)'}
            </h3>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              minHeight: '150px'
            }}>
              {myHand.map((card, i) => {
                const playable = canPlayCard(card);
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
                      disabled={!playable || !isMyTurn}
                      onClick={() => isMyTurn && playCard(i)}
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
              disabled={rolling || gameState.diceResult || !isMyTurn || gameState.skipDiceRoll}
              style={{
                background: rolling || gameState.diceResult || !isMyTurn || gameState.skipDiceRoll
                  ? 'linear-gradient(135deg, #95a5a6, #7f8c8d)' 
                  : 'linear-gradient(135deg, #3498db, #2980b9)',
                color: 'white',
                border: 'none',
                padding: '14px 35px',
                fontSize: '1.1em',
                borderRadius: '30px',
                cursor: rolling || gameState.diceResult || !isMyTurn || gameState.skipDiceRoll ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {gameState.skipDiceRoll ? '⏭️ Sem Dado' : '🎲 Rolar Dado'}
            </button>

            <button
              onClick={drawCard}
              disabled={(!gameState.diceResult && !gameState.skipDiceRoll && !gameState.pendingDrawCards) || !isMyTurn}
              style={{
                background: (!gameState.diceResult && !gameState.skipDiceRoll && !gameState.pendingDrawCards) || !isMyTurn
                  ? 'linear-gradient(135deg, #95a5a6, #7f8c8d)' 
                  : 'linear-gradient(135deg, #e67e22, #d35400)',
                color: 'white',
                border: 'none',
                padding: '14px 35px',
                fontSize: '1.1em',
                borderRadius: '30px',
                cursor: (!gameState.diceResult && !gameState.skipDiceRoll && !gameState.pendingDrawCards) || !isMyTurn ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              🃏 Comprar
            </button>

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

        {/* Modal de escolha de paridade */}
        {showParityModal && pendingCardPlay && (
          <ParityChoiceModal 
            onChoice={handleParityChoice}
            cardPlayed={pendingCardPlay.card}
          />
        )}

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

  if (screen === 'gameOver') {
    const winner = players.find(p => p.id === gameState?.winner);
    const isWinner = gameState?.winner === playerId;

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
          <div style={{ fontSize: '5em', marginBottom: '20px' }}>
            {isWinner ? '🎉' : '🐊'}
          </div>
          <h1 style={{ marginBottom: '20px' }}>
            {isWinner ? 'VOCÊ VENCEU!' : 'FIM DE JOGO'}
          </h1>
          <p style={{ fontSize: '1.3em', marginBottom: '30px' }}>
            {winner && (
              <>
                {winner.avatar} <strong>{winner.name}</strong> venceu!
              </>
            )}
          </p>
          <button
            onClick={() => {
              leaveRoom();
              setScreen('menu');
            }}
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
            Voltar ao Menu
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default ViraVoltaMultiplayer;