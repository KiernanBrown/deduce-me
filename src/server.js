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
// We will always have Room 1 and 2, but users can create more
const rooms = ['Room 1', 'Room 2'];

// Array of objects that contains users in a room
const users = [{}, {}];

// Count of users online
let totalUsers = 0;

const enterRoom = (sock, data) => {
  const socket = sock;

  // Announcement to everyone in the room
  const response = {
    name: 'server',
    msg: `${data.name} has joined the room.`,
  };
  socket.broadcast.to(data.room).emit('msg', response);

  // Success message to the new user
  socket.emit('msg', { name: 'server', msg: `You have joined ${data.room}` });

  // Create our new user to add to the users object
  const user = {
    name: data.name,
  };

    // Get the index of the room the user is joining
    // If the room does not have an index, set this to the number of rooms present
  let roomIndex;
  if (rooms.includes(data.room)) {
    // If this room existed, add the user to the users in that room
    // Get the index of the room the user is joining
    // Then add them as a property of that user object
    roomIndex = rooms.indexOf(data.room);
    users[roomIndex][Object.keys(users[roomIndex]).length] = user;
    console.dir(users);
  } else {
    // Otherwise this is a new room
    // Add a new userObj to our array of user objects
    // And add the new room to our array of rooms
    roomIndex = rooms.length;
    const userObj = { };
    userObj[0] = user;
    users.push(userObj);
    rooms.push(data.room);
    console.dir(users);

    // Update the room list for all clients
    io.sockets.emit('updateRooms', { rooms });
  }

  // Get the number of total users online and total users in the room
  // No longer used, we simply add or subtract on join or disconnect
  /* users.forEach(function(userObj) {
        totalUsers += Object.keys(userObj).length;
    }); */
  totalUsers++;
  const roomUsers = Object.keys(users[roomIndex]).length;

  // Message sent to the new user
  const joinMsg = {
    name: 'server',
    msg: `There are ${totalUsers} total users online\nThere are ${roomUsers} total users in ${data.room}`,
  };

  socket.name = data.name;
  socket.emit('msg', joinMsg);

  socket.join(data.room);
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

        // We destroy the room if this is the only user
        // As long as the room isn't Room 1 or 2
        if (Object.keys(userObj).length === 0 && userRoom !== 'Room 1' && userRoom !== 'Room 2') {
          // Remove the room from our list, and remove the userObj
          rooms.splice(roomIndex, 1);
          users.splice(roomIndex, 1);

          // Update our list of rooms for all clients now that this room has been removed
          io.sockets.emit('updateRooms', { rooms });
        }
        break;
      }
    }
  });

  // Send a message to the users in the room that this user has disconnected
  io.sockets.in(userRoom).emit('msg', { name: 'server', msg: `${socket.name} has disconnected.` });

  // Decrease the number of totalUsers online
  totalUsers--;
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
    if (data.msg[0] === '/') {
      if (data.msg.toUpperCase() === '/COUNT') {
        // Display the number of users on the server/in the room
        const roomUsers = Object.keys(users[rooms.indexOf(data.room)]).length;

        const countMsg = {
          name: 'server',
          msg: `There are ${totalUsers} total users online\nThere are ${roomUsers} total users in ${data.room}`,
        };

        socket.emit('msg', countMsg);
      } else if (data.msg.substring(0, 4).toUpperCase() === '/ME ') {
        // Broadcast the message displayed after /me to everyone in the room
        const meMsg = {
          msg: `${data.name} ${data.msg.substring(4)}`,
        };

        io.sockets.in(data.room).emit('msg', meMsg);
      } else {
        // Otherwise, give a list of possible commands
        const commandMsg = {
          name: 'server',
          msg: 'You entered an invalid commands. Possible commands are /count and /me (message).',
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
