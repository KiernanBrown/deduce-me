const http = require('http');
const url = require('url');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

// Read the client html file into memory
const index = fs.readFileSync(`${__dirname}/../client/client.html`);
const css = fs.readFileSync(`${__dirname}/../client/style.css`);

const onRequest = (request, response) => {
  const parsedUrl = url.parse(request.url);

  if (parsedUrl.pathname === '/') {
    response.writeHead(200, {
      'Content-Type': 'text/html',
    });
    response.write(index);
    response.end();
  } else if (parsedUrl.pathname === '/style.css') {
    response.writeHead(200, {
      'Content-Type': 'text/css',
    });
    response.write(css);
    response.end();
  }
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

// Array of rooms that exist on our server
const rooms = [];
const roomTimeouts = [];
const roomIntervals = [];

// Array of objects that contains users in a room
const users = [];

// List of random names to assign to players
// We use these to keep players anonymous
const names = ['Sora', 'Roxas', 'Makoto', 'Nagito', 'Aqua', 'Chiaki', 'Hey', 'Ness', 'Lucas', 'Link', 'Zelda', 'Mario', 'Luigi', 'Shulk', 'Cloud', 'Peach', 'Merlin', 'Donald', 'Goofy', 'Mickey', 'Riku', 'Ash', 'Gary', 'Misty', 'May', 'Dawn', 'Iris', 'Dahlia', 'Phoenix', 'Maya'];

// Lists of roles the player can have
const goodRoles = ['The Medic', 'The Investigator', 'The Follower', 'The Observer', 'The Guardian', 'The Flirt', 'The Vigilante', 'The Crier', 'The Knight'];
const evilRoles = ['The Assassin', 'The Chemist', 'The Informant'];

let roomCount = 0; // Amount of joinableRooms we have created since starting the server

// Function to set the timer
const setTimer = (r, time) => {
  const room = r;
  room.timer = time;
  io.sockets.in(room.roomName).emit('setTimer', {
    time: room.timer,
  });
};

// Function to decrease the timer by 1
const decreaseTimer = (r) => {
  const room = r;
  if (room.running) {
    room.timer--;
    io.sockets.in(room.roomName).emit('setTimer', {
      time: room.timer,
    });
  } else {
    clearInterval(roomIntervals[rooms.indexOf(room)]);
    roomIntervals[rooms.indexOf(room)] = null;
  }
};

// Returns an array of all players who chose the choice specified
const findPlayerChoice = (room, choice) => {
  const choosers = [];

  // Check if the entered name matches the displayName of a player in the game
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.choice === choice) {
      choosers.push(checkPlayer);
    }
  }

  return choosers;
};

const findPlayer = (room, enteredName) => {
  // Check if the entered name matches the displayName of a player in the game
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.displayName.toUpperCase() === enteredName.toUpperCase()) {
      return checkPlayer;
    }
  }

  return null;
};

const roleFindPlayer = (room, role) => {
  // Check if the role matches the role of a player in game
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.role === role) {
      return checkPlayer;
    }
  }

  return null;
};

// Function for finding players by their socket id
const findPlayerId = (room, id) => {
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.socketId === id) {
      return checkPlayer;
    }
  }

  return null;
};

const findPoisonedPlayer = (room) => {
  // Find a poinsoned player in the game
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.poisoned) {
      return checkPlayer;
    }
  }

  return null;
};

// Function that returns an array of evil players
// Used for evil team chatting at night
const findEvil = (room) => {
  const evil = [];

  // Check if the entered name matches the displayName of a player in the game
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const checkPlayer = users[roomIndex][roomUsers[i]];
    if (checkPlayer.alignment === 'Evil') {
      evil.push(checkPlayer);
    }
  }

  return evil;
};

// Function used to update the list of users for the client
const updateUserList = (room) => {
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  const userList = [];
  for (let i = 0; i < roomUsers.length; i++) {
    userList.push(users[roomIndex][roomUsers[i]]);
  }

  // Give the client the list of roomUsers
  io.sockets.in(room.roomName).emit('setUserList', {
    users: userList,
  });
};

const createNewRoom = () => {
  roomCount++;
  const roomObj = {
    roomName: `Room${roomCount}`,
    joinable: true,
  };

  rooms.push(roomObj);
  users[rooms.indexOf(roomObj)] = {};
  return rooms[rooms.indexOf(roomObj)];
};

const getBestRoom = () => {
  let bestRoom;
  let userCount = -1;

  // If there are no rooms, create one
  if (rooms.length === 0) {
    return createNewRoom();
  }

  // Otherwise, we loop through our rooms and see if at least one is joinable
  let joinable = false;
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].joinable) {
      joinable = true;
      break;
    }
  }

  // If no rooms are joinable, create a new room
  if (!joinable) return createNewRoom();

  // Otherwise, we have at least one joinable room
  // Loop through our rooms and find the joinable room with the most users
  for (let i = 0; i < rooms.length; i++) {
    const checkRoom = rooms[i];
    if (checkRoom.joinable) {
      // const roomUsers = Object.keys(checkRoom).length;
      const roomUsers = Object.keys(users[i]).length;
      if (roomUsers < 12 && roomUsers > userCount) {
        userCount = roomUsers;
        bestRoom = checkRoom;
      }
    }
  }

  return bestRoom;
};

// Used at the end of each day and night to reset all player choices and votes
const resetChoices = (room) => {
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const player = users[roomIndex][roomUsers[i]];
    player.choice = '';
    player.vote = '';
  }
};

const endGame = (r, team) => {
  const room = r;
  const roomIndex = rooms.indexOf(room);
  if (team === 'Good') {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: 'Every Evil player has died. The Good team has won the game!',
    });
  } else if (team === 'Evil') {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: 'The Evil players are now equal to, or outnumber, the good players. The Evil team has won the game!',
    });
  }

  // Reset the room and allow players to join it again
  room.time = '';
  clearTimeout(roomTimeouts[roomIndex]);
  clearInterval(roomIntervals[roomIndex]);
  roomTimeouts[roomIndex] = null;
  roomIntervals[roomIndex] = null;
  room.joinable = true;
  room.running = false;

  // If there are still at least 6 players in the room, the game will start again
  // This causes a circular loop in our code
  // endGame calls startGame, killPlayer can call endGame
  // startGame calls handleGame, handleGame calls handleRoleActions,
  // handleRoleActions calls killPlayer
  // In this case, we cannot have all of these functions defined without one needing a function
  // that gets defined later
  // For now, we will just not have endGame call start game, and tell players to reconnect instead
  /*
  const roomUsers = Object.keys(users[roomIndex]).length;

  if (roomUsers >= 6) {
    roomTimeouts[roomIndex] = setTimeout(() => {
      startGame(room);
    }, 20000);
    setTimer(room, 20);
    roomIntervals[roomIndex] = setInterval(() => {
      decreaseTimer(room);
    }, 1000);
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: 'The next game will start in 20 seconds!',
    });
  } else {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: 'There are not enough players to start another game. Waiting for more players.',
    });
  }
  */

  io.sockets.in(room.roomName).emit('msg', {
    name: 'server',
    msg: 'Please reconnect to play another game!',
  });
};


// Function to kill a player
const killPlayer = (r, p, disconnect) => {
  const room = r;
  const player = p;
  player.alive = false;
  if (disconnect) {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: `${player.displayName} ${player.role} mysteriously dropped dead (Disconnection).`,
    });
  } else if (room.time === 'Night') {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: `${player.displayName} ${player.role} was found dead during the morning. `,
    });
  } else if (room.time === 'Day Voting') {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: `${player.displayName} ${player.role} was executed.`,
    });
  }

  // Update our tally of living players, good living players, and evil living players
  if (player.alignment === 'Good') {
    room.aliveGood--;
    // End the game if there are an equal number of good and evil players
    if (room.aliveGood <= room.aliveEvil) {
      endGame(room, 'Evil');
    }
  } else if (player.alignment === 'Evil') {
    room.aliveEvil--;
    // End the game if there are no more evil player alive
    if (room.aliveEvil === 0) {
      endGame(room, 'Good');
    }
  }

  updateUserList(room);
};

// Handles the actions at night
const handleRoleActions = (room) => {
  // Make a list of players who are marked to die for tonight
  const markedPlayers = [];
  let blockedPlayer;
  let guardedPlayer;
  let guard;

  // Add the currently poisoned players to our markedPlayers list, if there is a poisoned player
  const poisonedPlayer = findPoisonedPlayer(room);
  if (poisonedPlayer) markedPlayers.push(poisonedPlayer);

  // First we handle The Flirt's action
  let player = roleFindPlayer(room, 'The Flirt');
  if (player && player.choice) {
    // Only handle the action if the player exists
    blockedPlayer = player.choice;

    // Send messages to The Flirt and their target
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You blocked the action of ${player.choice.displayName}.`,
    });

    io.sockets.to(player.choice.socketId).emit('msg', {
      name: 'Role Action',
      msg: 'Your action was blocked by The Flirt.',
    });
  }

  // Handle The Observer's action
  player = roleFindPlayer(room, 'The Observer');
  if (player && player.choice && player !== blockedPlayer) {
    const choosers = findPlayerChoice(room, player.choice);
    if (choosers.length === 0) {
      io.sockets.to(player.socketId).emit('msg', {
        name: 'Role Action',
        msg: `No one visited ${player.choice.displayName}.`,
      });
    } else {
      for (let i = 0; i < choosers.length; i++) {
        io.sockets.to(player.socketId).emit('msg', {
          name: 'Role Action',
          msg: `${choosers[i].displayName} is visiting ${player.choice.displayName}.`,
        });
      }
    }
  }

  // Handle The Follower's action
  player = roleFindPlayer(room, 'The Follower');
  if (player && player.choice && player !== blockedPlayer) {
    if (player.choice.choice) {
      io.sockets.to(player.socketId).emit('msg', {
        name: 'Role Action',
        msg: `${player.choice.displayName} is visiting ${player.choice.choice.displayName}.`,
      });
    } else {
      io.sockets.to(player.socketId).emit('msg', {
        name: 'Role Action',
        msg: `${player.choice.displayName} did not visit anyone.`,
      });
    }
  }

  // Handle The Chemist's action
  player = roleFindPlayer(room, 'The Chemist');
  if (player && player.choice && player !== blockedPlayer) {
    player.choice.poisoned = true;

    // Send messages to The Chemist and their target
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You have poisoned ${player.choice.displayName}.`,
    });

    io.sockets.to(player.choice.socketId).emit('msg', {
      name: 'Role Action',
      msg: 'You have been poisoned by The Chemist. You will die after the next night if you are not healed.',
    });
  }

  // Handle The Medic's action
  player = roleFindPlayer(room, 'The Medic');
  if (player && player.choice && player !== blockedPlayer) {
    const healedPlayer = player.choice;

    // Send messages to The Medic and potentially their target
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You have healed ${player.choice.displayName}.`,
    });

    if (healedPlayer.poisoned) {
      io.sockets.to(player.choice.socketId).emit('msg', {
        name: 'Role Action',
        msg: 'You have been cured of your poison.',
      });
    }

    healedPlayer.poisoned = false;
    healedPlayer.healed = true;
  }

  // Handle The Guardian's action
  player = roleFindPlayer(room, 'The Guardian');
  if (player && player.choice && player !== blockedPlayer) {
    guardedPlayer = player.choice;
    guard = player;

    // Send a message to The Guardian
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You are protecting ${player.choice.displayName}.`,
    });
  }

  // Handle The Investigator's action
  player = roleFindPlayer(room, 'The Investigator');
  if (player && player.choice && player !== blockedPlayer) {
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `${player.choice.displayName} is ${player.choice.alignment}.`,
    });
  }

  // Handle The Informant's action
  player = roleFindPlayer(room, 'The Informant');
  if (player && player.choice && player !== blockedPlayer) {
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `${player.choice.displayName} is ${player.choice.role}.`,
    });
  }

  // Handle The Assassin's action
  player = roleFindPlayer(room, 'The Assassin');
  if (player && player.choice && player !== blockedPlayer) {
    let targetedPlayer = player.choice;

    // If the target is being guarded, the target switches to the guard
    if (targetedPlayer === guardedPlayer) {
      targetedPlayer = guard;
    }

    // If the targetedPlayer has not been healed, they are added to the markedPlayers
    if (!targetedPlayer.healed) {
      markedPlayers.push(targetedPlayer);
    }

    // Send a message to The Assassin
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You have attacked ${player.choice.displayName}.`,
    });
  }

  // Handle The Vigilante's action
  player = roleFindPlayer(room, 'The Vigilante');
  if (player && player.choice && player !== blockedPlayer && !player.used) {
    let targetedPlayer = player.choice;

    // If the target is being guarded, the target switches to the guard
    if (targetedPlayer === guardedPlayer) {
      targetedPlayer = guard;
    }

    // If the targetedPlayer has not been healed, they are added to the markedPlayers
    if (!targetedPlayer.healed) {
      markedPlayers.push(targetedPlayer);
    }
    player.used = true;

    // Send a message to The Vigilante
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You have used your bullet to shoot ${player.choice.displayName}.`,
    });
  }

  // Handle The Knight's action
  player = roleFindPlayer(room, 'The Knight');
  if (player && player.choice && player !== blockedPlayer) {
    let targetedPlayer = player.choice;

    // If the target is being guarded, the target switches to the guard
    if (targetedPlayer === guardedPlayer) {
      targetedPlayer = guard;
    }

    // If the targeted player is good, The Knight is marked
    if (targetedPlayer.alignment === 'Good') {
      markedPlayers.push(player);
    } else if (targetedPlayer.alignment === 'Evil' && !targetedPlayer.healed) {
      // If the targeted player is evil and not being healed, they are marked
      markedPlayers.push(targetedPlayer);
    }

    // Send a message to The Knight
    io.sockets.to(player.socketId).emit('msg', {
      name: 'Role Action',
      msg: `You have attacked ${player.choice.displayName}.`,
    });
  }

  // Loop through our markedPlayers and kill them
  for (let i = 0; i < markedPlayers.length; i++) {
    killPlayer(room, markedPlayers[i]);
  }
};

// Function to handle the game
const handleGame = (r) => {
  const room = r;
  if (room.running) {
    if (room.time === 'Day') {
      // End the day
      io.sockets.in(room.roomName).emit('msg', {
        name: 'server',
        msg: 'Day has ended.',
      });

      resetChoices(room);

      // Start the night
      room.time = 'Night';
      io.sockets.in(room.roomName).emit('msg', {
        name: 'server',
        msg: 'It is now night time. You have 30 seconds until night ends.',
      });
      io.sockets.in(room.roomName).emit('setPhase', {
        phase: room.time,
      });
      setTimer(room, 30);
      roomTimeouts[rooms.indexOf(room)] = setTimeout(() => {
        handleGame(room);
      }, 30000);
    } else if (room.time === 'Night') {
      // End the night
      io.sockets.in(room.roomName).emit('msg', {
        name: 'server',
        msg: 'Night has ended.',
      });
      handleRoleActions(room);

      resetChoices(room);
      // Start the day
      room.time = 'Day';
      io.sockets.in(room.roomName).emit('msg', {
        name: 'server',
        msg: 'It is now day time. You have 90 seconds until day ends.',
      });
      io.sockets.in(room.roomName).emit('setPhase', {
        phase: room.time,
      });
      setTimer(room, 90);
      roomTimeouts[rooms.indexOf(room)] = setTimeout(() => {
        handleGame(room);
      }, 90000);
    }
  }
};

const startGame = (r) => {
  const room = r;
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);
  const availableNames = names.slice();
  // const availableRoles = roles.slice();

  // Get our list of availableRoles for this game
  const availableRoles = [];
  let goodRoleCount = 0;
  let evilRoleCount = 0;
  switch (roomUsers.length) {
    case 6:
      goodRoleCount = 5;
      evilRoleCount = 1;
      break;
    case 7:
      goodRoleCount = 6;
      evilRoleCount = 1;
      break;
    case 8:
      goodRoleCount = 6;
      evilRoleCount = 2;
      break;
    case 9:
      goodRoleCount = 7;
      evilRoleCount = 2;
      break;
    case 10:
      goodRoleCount = 8;
      evilRoleCount = 2;
      break;
    case 11:
      goodRoleCount = 8;
      evilRoleCount = 3;
      break;
    case 12:
      goodRoleCount = 9;
      evilRoleCount = 3;
      break;
      // The default case should never happen
      // If it does for some reason, we will return here and give an error
    default:
      io.sockets.in(room.roomName).emit('msg', {
        name: 'server',
        msg: 'Something is wrong with the number of players! Please reconnect and try again.',
      });
      return;
  }

  // Fill out our availableRoles
  // Get our good roles that will be present this game
  for (let i = 0; i < goodRoleCount; i++) {
    let role;
    do {
      role = goodRoles[Math.floor(Math.random() * goodRoles.length)];
    } while (availableRoles.includes(role));
    availableRoles.push(role);
  }

  // Get our evil roles that will be present this game
  // Always have an assassin
  availableRoles.push(evilRoles[0]);
  for (let i = 0; i < evilRoleCount - 1; i++) {
    let role;
    do {
      role = evilRoles[Math.floor(Math.random() * evilRoles.length)];
    } while (availableRoles.includes(role));
    availableRoles.push(role);
  }

  // Give every player a name and a role
  for (let i = 0; i < roomUsers.length; i++) {
    const player = users[roomIndex][roomUsers[i]];

    // Set the player's displayName and remove the name from our availableNames
    player.displayName = availableNames[Math.floor(Math.random() * availableNames.length)];
    availableNames.splice(availableNames.indexOf(player.displayName), 1);

    // Set the player's role and remove the role from our availableRoles
    const roleNum = Math.floor(Math.random() * availableRoles.length);
    player.role = availableRoles[roleNum];
    if (goodRoles.includes(player.role)) player.alignment = 'Good';
    else player.alignment = 'Evil';
    availableRoles.splice(roleNum, 1);

    // Set the player's alive property to true
    player.alive = true;

    // Send the player a message with their display name and role
    io.sockets.to(player.socketId).emit('msg', {
      name: 'server',
      msg: `Your display name has been changed to ${player.displayName}. Your role is ${player.role}.`,
    });

    io.sockets.to(player.socketId).emit('setDisplayName', {
      displayName: player.displayName,
    });
    io.sockets.to(player.socketId).emit('setRole', {
      role: player.role,
    });
  }

  // The room is no longer joinable since the game has started
  room.joinable = false;
  room.running = true;
  room.aliveGood = goodRoleCount;
  room.aliveEvil = evilRoleCount;
  setTimer(room, 30);

  // We set the start time to day, and call handleGame to start night when the game starts
  updateUserList(room);
  room.time = 'Day';
  handleGame(room);

  // Set our interval to decrease the timer
  if (roomIntervals[roomIndex]) {
    clearInterval(roomIntervals[roomIndex]);
  }
  roomIntervals[roomIndex] = setInterval(() => {
    decreaseTimer(room);
  }, 1000);

  console.dir(users);
  console.dir(rooms);
};

const handleExecution = (r) => {
  const room = r;
  let voteCount = 0;
  let executes = 0;
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const player = users[roomIndex][roomUsers[i]];
    if (player.vote) {
      voteCount++;
      if (player.vote === 'Execute') executes++;
    }
  }

  if (executes >= Math.floor((voteCount / 2)) + 1) {
    // If the number of votes for an execution is the majority of the votes, we execute
    killPlayer(room, room.accused);
  } else {
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: `${room.accused.displayName} has been pardoned!`,
    });
  }

  // Display messages for every players vote
  for (let i = 0; i < roomUsers.length; i++) {
    const player = users[roomIndex][roomUsers[i]];
    if (player.alive) {
      if (player.vote) {
        io.sockets.in(room.roomName).emit('msg', {
          name: 'server',
          msg: `${player.displayName} voted to ${player.vote}`,
        });
      } else {
        io.sockets.in(room.roomName).emit('msg', {
          name: 'server',
          msg: `${player.displayName} abstained from voting`,
        });
      }
    }
  }

  // Set the timer to 10 seconds and end day after that
  room.time = 'Day';
  setTimer(room, 10);
  io.sockets.in(room.roomName).emit('msg', {
    name: 'server',
    msg: 'Day will end in 10 seconds.',
  });
  io.sockets.in(room.roomName).emit('setPhase', {
    phase: room.time,
  });
  roomTimeouts[roomIndex] = setTimeout(() => {
    handleGame(room);
  }, 10000);
};

const tallyAccusations = (r) => {
  const room = r;
  const accusations = [];
  const roomIndex = rooms.indexOf(room);
  const roomUsers = Object.keys(users[roomIndex]);

  for (let i = 0; i < roomUsers.length; i++) {
    const player = users[roomIndex][roomUsers[i]];
    if (player.choice) accusations.push(player.choice.displayName);
  }

  // Start voting if the majority of players (half + 1) have voted for a single person
  if (room.time === 'Day') {
    const accusationCounts = {};
    const alivePlayers = room.aliveGood + room.aliveEvil;

    for (let i = 0; i < accusations.length; i++) {
      const accused = accusations[i];
      accusationCounts[accused] = (accusationCounts[accused] || 0) + 1;
    }

    const keys = Object.keys(accusationCounts);

    console.dir(keys);

    for (let i = 0; i < keys.length; i++) {
      if (accusationCounts[keys[i]] >= Math.floor((alivePlayers / 2)) + 1) {
        // Set our accused and time
        room.accused = findPlayer(room, keys[i]);
        console.dir(room.accused);
        room.time = 'Day Voting';

        io.sockets.in(room.roomName).emit('msg', {
          name: 'server',
          msg: `${room.accused.displayName} has been accused of being evil! You have 30 seconds to vote using !execute or !pardon. If the majority of players who vote choose to execute, this player will be executed.`,
        });
        io.sockets.in(room.roomName).emit('setPhase', {
          phase: room.time,
        });

        // Reset the timer to 30 seconds, after which the execution is decided
        setTimer(room, 30);
        clearTimeout(roomTimeouts[roomIndex]);
        roomTimeouts[roomIndex] = setTimeout(() => {
          handleExecution(room);
        }, 30000);
      }
    }
  }
};


const enterRoom = (sock, data) => {
  const socket = sock;
  const room = getBestRoom();

  // Announcement to everyone in the room
  const response = {
    name: 'server',
    msg: `${data.name} has joined the room.`,
  };
  socket.broadcast.to(room.roomName).emit('msg', response);

  // Success message to the new user
  socket.emit('msg', {
    name: 'server',
    msg: `You have joined ${room.roomName}`,
  });

  // Create our new user to add to the users object
  const user = {
    name: data.name,
    socketId: socket.id,
  };

  const roomIndex = rooms.indexOf(room);
  let roomUsers = Object.keys(users[roomIndex]).length;
  users[rooms.indexOf(room)][roomUsers] = user;
  roomUsers++;

  socket.join(room.roomName);

  // Message sent to the new user
  const joinMsg = {
    name: 'server',
    msg: `There are ${roomUsers} total users in ${room.roomName}.`,
  };
  if (roomUsers === 12) {
    clearTimeout(roomTimeouts[roomIndex]);
    clearInterval(roomIntervals[roomIndex]);
    startGame(room);
  } else if (roomUsers === 6) {
    roomTimeouts[roomIndex] = setTimeout(() => {
      startGame(room);
    }, 20000);
    setTimer(room, 20);
    roomIntervals[roomIndex] = setInterval(() => {
      decreaseTimer(room);
    }, 1000);
    io.sockets.in(room.roomName).emit('msg', {
      name: 'server',
      msg: 'The game will start in 20 seconds!',
    });
  } else if (roomUsers < 6) {
    joinMsg.msg = `${joinMsg.msg} You need at least 6 people to start the game.`;
  }

  socket.name = data.name;
  socket.emit('msg', joinMsg);
  socket.emit('joinedRoom', room);
};

const leaveRoom = (sock) => {
  const socket = sock;

  let userRoom;
  let roomIndex;
  // Search for the user and remove them
  users.forEach((userObj) => {
    // Loop through our properties of this user object
    for (let i = 0; i < Object.keys(userObj).length; i++) {
      // Find the disconnected user in the userObj
      if (userObj[Object.keys(userObj)[i]].name === socket.name) {
        // Get the room of the user for disconnection message
        roomIndex = users.indexOf(userObj);
        userRoom = rooms[roomIndex];

        if (userRoom.running && userObj[Object.keys(userObj)[i]].alive) {
          killPlayer(userRoom, userObj[Object.keys(userObj)[i]], true);
        }

        const removeObj = userObj;
        // Shift every property after this index down by one
        // This removes the user that left and shifts the other users down
        for (let j = i; j < Object.keys(userObj).length - 1; j++) {
          removeObj[j] = removeObj[j + 1];
        }

        // Delete the last property, removing the now empty user
        delete removeObj[Object.keys(removeObj)[Object.keys(userObj).length - 1]];

        // Leave the room
        socket.leave(userRoom);
        break;
      }
    }
  });

  // Send a message to the users in the room that this user has disconnected
  if (userRoom.joinable) {
    io.sockets.in(userRoom.roomName).emit('msg', {
      name: 'server',
      msg: `${socket.name} has disconnected.`,
    });
    if (Object.keys(users[roomIndex]).length === 5) {
      // We no longer have enough players for the game
      // Stop the timer and starting of the game
      clearTimeout(roomTimeouts[roomIndex]);
      clearInterval(roomIntervals[roomIndex]);
      delete roomTimeouts[roomIndex];
      io.sockets.in(userRoom.roomName).emit('msg', {
        name: 'server',
        msg: 'The player count in the room has fallen below 6. The timer for starting the game has been reset, and will not start until at least 6 users are in the room.',
      });
    }
  }
};

const onJoined = (sock) => {
  sock.on('join', (data) => {
    enterRoom(sock, data);
  });
};

const onMsg = (sock) => {
  const socket = sock;

  socket.on('msgToServer', (data) => {
    // Get the room of the message
    let room;
    for (let i = 0; i < rooms.length; i++) {
      if (rooms[i].roomName === data.room) {
        room = rooms[i];
        break;
      }
    }

    // Get the message sender
    const sender = findPlayerId(room, socket.id);

    // Return if the sender is dead, dead people cannot message
    if (room.running && !sender.alive) {
      return;
    }

    // Check if the message is a command
    if (data.msg[0] === '!') {
      if (data.msg.toUpperCase() === '!EXECUTE') {
        // The !execute command is used during Day Voting to vote to execute
        if (room.time === 'Day Voting') {
          if (sender !== room.accused) {
            sender.vote = 'Execute';
            socket.emit('msg', {
              name: 'server',
              msg: `You have voted to execute ${room.accused.displayName}`,
            });
          }
        }
      } else if (data.msg.toUpperCase() === '!PARDON') {
        // The !pardon command is used during Day Voting to vote to pardon
        if (room.time === 'Day Voting') {
          if (sender !== room.accused) {
            sender.vote = 'Pardon';
            socket.emit('msg', {
              name: 'server',
              msg: `You have voted to pardon ${room.accused.displayName}`,
            });
          }
        }
      } else if (data.msg.substring(0, 8).toUpperCase() === '!CHOOSE ') {
        // The !choose command is used at night to perform role actions
        // This command is also used during day to accuse a player
        // Get the name that we entered, and the keys for users in our room
        const enteredName = data.msg.split(' ')[1];

        // Check if the entered name matches the displayName of a player in the game
        const chosenPlayer = findPlayer(room, enteredName);

        // Set our chooseMsg
        const chooseMsg = {
          name: 'server',
        };

        if (!chosenPlayer) {
          chooseMsg.msg = 'Invalid player chosen! Please enter the displayName of a player in your game after the !choose command!';
          socket.emit('msg', chooseMsg);
          return;
        }

        if (!chosenPlayer.alive) {
          chooseMsg.msg = 'You cannot choose a player if you are already dead!';
          socket.emit('msg', chooseMsg);
          return;
        }

        // The player we have entered does exist
        // If it's day, accuse the player. If it's night, do the role action on the player
        if (room.time === 'Day') {
          // Set our chooseMsg
          io.sockets.emit('msg', {
            name: 'server',
            msg: `${sender.displayName} has accused ${chosenPlayer.displayName} of being evil!`,
          });
          sender.choice = chosenPlayer;
          tallyAccusations(room);
          return;
        }

        chooseMsg.msg = `You have chosen ${chosenPlayer.displayName}!`;
        socket.emit('msg', chooseMsg);

        sender.choice = chosenPlayer;
      } else {
        // Otherwise, give a list of possible commands
        const commandMsg = {
          name: 'server',
          msg: 'You entered an invalid commands. Possible commands are !choose displayName, !execute, and !pardon',
        };

        socket.emit('msg', commandMsg);
      }
    } else if (room.running) {
      if (room.time === 'Day' || room.time === 'Day Voting') {
        // Use display names for messaging if the game is running
        io.sockets.in(data.room).emit('msg', {
          name: sender.displayName,
          msg: data.msg,
        });
      } else if (room.time === 'Night') {
        if (sender.role === 'The Crier') {
          // Allow The Crier to speak anonymously at night
          io.sockets.in(data.room).emit('msg', {
            name: 'The Crier',
            msg: data.msg,
          });
        } else if (sender.alignment === 'Evil') {
          // Evil player speak amongst evil players at night
          const evil = findEvil(room);
          for (let i = 0; i < evil.length; i++) {
            io.sockets.to(evil[i].socketId).emit('msg', {
              name: sender.displayName,
              msg: data.msg,
            });
          }
        } else {
          // Other players cannot speak at night
          socket.emit('msg', {
            name: 'server',
            msg: 'You cannot speak at night!',
          });
        }
      }
    } else {
      io.sockets.in(data.room).emit('msg', {
        name: data.name,
        msg: data.msg,
      });
    }
  });
};

const onSwitch = (sock) => {
  sock.on('switch', (data) => {
    // Leave the current room
    leaveRoom(sock);

    // Join the new room
    enterRoom(sock, data);
  });
};

const onDisconnect = (sock) => {
  sock.on('disconnect', () => {
    leaveRoom(sock);
  });
};

io.sockets.on('connection', (socket) => {
  console.log('started');

  onJoined(socket);
  onMsg(socket);
  onSwitch(socket);
  onDisconnect(socket);
});

console.log('Websocket server started');
