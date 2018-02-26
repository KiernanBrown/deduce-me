const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

// Read the client html file into memory
const index = fs.readFileSync(`${__dirname}/../client/client.html`);

const onRequest = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.write(index);
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

// Array of rooms that exist on our server
const rooms = [];
const roomTimeouts = [];

// Array of objects that contains users in a room
const users = [];

// List of random names to assign to players
// We use these to keep players anonymous
const names = ['Sora', 'Roxas', 'Makoto', 'Nagito', 'Aqua', 'Chiaki', 'Hey', 'Ness', 'Lucas', 'Link', 'Zelda', 'Mario', 'Luigi', 'Shulk', 'Cloud', 'Peach', 'Merlin', 'Donald', 'Goofy', 'Mickey', 'Riku', 'Ash', 'Gary'];

// Lists of roles the player can have
const goodRoles = ['The Medic', 'The Investigator', 'The Follower', 'The Observer', 'The Guardian', 'The Flirt', 'The Vigilante', 'The Crier'];
const evilRoles = ['The Assassin', 'The Phantom', 'The Chemist', 'The Informant'];

let roomCount = 0; // Amount of joinableRooms we have created since starting the server

// Looking to rework this code later
// There should be a way to have everything inside of one function?
/* const endDay = (r) => {
  const room = r;
  io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'Day has ended.' });
  startNight(room);
}; */

const startDay = (r) => {
  const room = r;
  io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'It is now day time. You have 75 seconds until day ends.' });
  room.time = 'Day';

  /* roomTimeouts[rooms.indexOf(room)] = setTimeout(() => {
    endDay(room);
  }, 30000); */
};

const endNight = (r) => {
  const room = r;
  io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'Night has ended.' });
  io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'Code will be placed here to handle role actions.' });

  startDay(room);
};

const startNight = (r) => {
  const room = r;
  io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'It is now night time. You have 30 seconds until night ends.' });
  room.time = 'Night';
  roomTimeouts[rooms.indexOf(room)] = setTimeout(() => {
    endNight(room);
  }, 30000);
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
    case 6: goodRoleCount = 5;
      evilRoleCount = 1;
      break;
    case 7: goodRoleCount = 5;
      evilRoleCount = 2;
      break;
    case 8: goodRoleCount = 6;
      evilRoleCount = 2;
      break;
    case 9: goodRoleCount = 7;
      evilRoleCount = 2;
      break;
    case 10: goodRoleCount = 7;
      evilRoleCount = 3;
      break;
    case 11: goodRoleCount = 8;
      evilRoleCount = 3;
      break;
    case 12: goodRoleCount = 8;
      evilRoleCount = 4;
      break;
    // The default case should never happen
    // If it does for some reason, we will return here and give an error
    default: io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'Something is wrong with the number of players! Please reconnect and try again.' });
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

  console.dir(availableNames);
  console.dir(availableRoles);

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
  }

  // The room is no longer joinable since the game has started
  room.joinable = false;
  startNight(room);

  console.dir(users);
  console.dir(rooms);
};

const createNewRoom = () => {
  roomCount++;
  const roomObj = {
    roomName: `Room${roomCount}`,
    joinable: true,
  };

  rooms.push(roomObj);
  users[rooms.indexOf(roomObj)] = { };
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
      console.dir(roomUsers);
      if (roomUsers < 12 && roomUsers > userCount) {
        userCount = roomUsers;
        bestRoom = checkRoom;
      }
    }
  }

  return bestRoom;
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
  socket.emit('msg', { name: 'server', msg: `You have joined ${room.roomName}` });

  // Create our new user to add to the users object
  const user = {
    name: data.name,
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
    startGame(room);
  } else if (roomUsers === 6) {
    // room.timedStart();
    roomTimeouts[roomIndex] = setTimeout(() => {
      startGame(room);
    }, 20000);
    io.sockets.in(room.roomName).emit('msg', { name: 'server', msg: 'The game will start in 20 seconds!' });
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

  console.dir(rooms);
  console.dir(users);

  // Send a message to the users in the room that this user has disconnected
  if (userRoom.joinable) {
    io.sockets.in(userRoom.roomName).emit('msg', { name: 'server', msg: `${socket.name} has disconnected.` });
    if (Object.keys(users[roomIndex]).length === 5) {
      clearTimeout(roomTimeouts[roomIndex]);
      delete roomTimeouts[roomIndex];
      io.sockets.in(userRoom.roomName).emit('msg', { name: 'server', msg: 'The player count in the room has fallen below 6. The timer for starting the game has been reset, and will not start until at least 6 users are in the room.' });
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
    // Check if the message is a command
    if (data.msg[0] === '!') {
      if (data.msg.substring(0, 8).toUpperCase() === '!CHOOSE ') {
        // Get the room object
        let room;
        for (let i = 0; i < rooms.length; i++) {
          if (rooms[i].roomName === data.room) {
            room = rooms[i];
            break;
          }
        }

        if (room.time === 'Day') {
          // Set our chooseMsg
          const chooseMsg = {
            name: 'server',
            msg: 'You can only choose a player during the night time!',
          };
          socket.emit('msg', chooseMsg);
          return;
        }

        // Get the name that we entered, and the keys for users in our room
        const enteredName = data.msg.split(' ')[1];
        const roomUsers = Object.keys(users[rooms.indexOf(room)]);

        // Check if the entered name matches the displayName of a player in the game
        let chosenPlayer = null;
        const roomIndex = rooms.indexOf(room);

        for (let i = 0; i < roomUsers.length; i++) {
          const checkPlayer = users[roomIndex][roomUsers[i]];
          if (checkPlayer.displayName.toUpperCase() === enteredName.toUpperCase()) {
            chosenPlayer = enteredName;
            break;
          }
        }

        // Set our chooseMsg
        const chooseMsg = {
          name: 'server',
        };

        if (!chosenPlayer) {
          chooseMsg.msg = 'Invalid player chosen! Please enter the displayName of a player in your game after the !choose command!';
          socket.emit('msg', chooseMsg);
          return;
        }

        chooseMsg.msg = `You have chosen ${enteredName}!`;
        socket.emit('msg', chooseMsg);
      } else {
        // Otherwise, give a list of possible commands
        const commandMsg = {
          name: 'server',
          msg: 'You entered an invalid commands. Possible commands are !choose (displayName) and !role.',
        };

        socket.emit('msg', commandMsg);
      }
    } else {
      io.sockets.in(data.room).emit('msg', { name: data.name, msg: data.msg });
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
