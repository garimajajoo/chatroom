// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

// Do the Socket.IO magic:
var io = socketio.listen(app);
//dictionary keeps track of which users are in which rooms
var room_dict = {};
//keeps track of each user's socket
var socket_dict = {};
//keeps track of each room and its password
var passwords = {};
//keeps track of which users are banned from which rooms
var banned_dict = {};
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
	
	socket.on('message_to_server', function(data, room_name, username) {
		// This callback runs when the server receives a new message from the client.
		
		console.log("message: "+data["message"]); // log it to the Node.JS output
		io.sockets.in(room_name).emit("message_to_client",{message:data["message"] }, username) // broadcast the message to other users
	});

	//after logging in a user's socket is recorded in the socket dictionary
	 socket.on('login', function(username){
		socket_dict[username]=socket;
	 	this.emit('login_to_client',username)
	 });

	//after creating a room a room is put into the room, password, and banned dictionaries
	socket.on('create_room', function(room_name, password){
		room_dict[room_name] = [];
		passwords[room_name] = password;
		banned_dict[room_name] = [];
		io.sockets.emit('create_room_to_client',room_name)
	});

	//server takes in the room dictionary so all the rooms can be displayed to a user
	socket.on('load_rooms',function(data){
		this.emit('load_rooms_to_client', room_dict)
	});

	//checks if a user is banned from a room, if not allows the user to join a room and records their presence in the room_dict
	socket.on('join_room',function(room_name,username){
		if(banned_dict[room_name].indexOf(username)!= -1){
			this.emit('ban_message', null);
		}
		else{
			var users = room_dict[room_name];
			users.push(username);
			room_dict[room_name]=users;
			socket.join(room_name);
			this.emit('join_to_client',username, room_dict[room_name], room_name);
			io.sockets.in(room_name).emit('show_users_to_client', username, room_dict[room_name], room_name)
		}
	});

	//allows user to leave a room and gets rid of them in the room_dict
	socket.on('leave_room', function(room_name,username){
		console.log(room_name);
		var users = room_dict[room_name];
		console.log(users);
		var pos = users.indexOf(username);
		var removed = users.splice(pos,1);
		room_dict[room_name]=users;
		socket.leave(room_name);
		io.sockets.in(room_name).emit('show_users_to_client', username, room_dict[room_name], room_name)
	});

	//checking if a room has a password
	socket.on('password', function(room_name){
		var password = passwords[room_name];
		if(password==null){
			this.emit('no_password_to_client', room_name)
		}

		else{
			this.emit('password_to_client',room_name)
		}
	});

	//checks if the user entered the correct password for a password protected room
	socket.on('check_password', function(room_name, password){
		if(passwords[room_name]==password){
			this.emit('correct_password_to_client', room_name)
		}
		else{
			this.emit('incorrect_password_to_client',null)
		}
	});

	//removes a user from the room_dict when another person removes them
	socket.on('remove', function(username,room_name){
		var users = room_dict[room_name];
		var pos = users.indexOf(username);
		var removed = users.splice(pos,1);
		room_dict[room_name]=users;
		var so = socket_dict[username];
		so.leave(room_name);
		io.sockets.in(room_name).emit('show_users_to_client', username, room_dict[room_name], room_name)
		so.emit('remove_to_client',null);
	});

	//removes a user from the room_dict and addes them to the banned_dict if they are banned from the room
	socket.on('ban', function(username,room_name){
		var banned_users = banned_dict[room_name];
		banned_users.push(username);
		banned_dict[room_name]=banned_users;
		console.log(banned_dict[room_name]);
		var users = room_dict[room_name];
		var pos = users.indexOf(username);
		var removed = users.splice(pos,1);
		room_dict[room_name]=users;
		var so = socket_dict[username];
		so.leave(room_name);
		io.sockets.in(room_name).emit('show_users_to_client', username, room_dict[room_name], room_name)
		so.emit('ban_to_client',null);
	});

	//checks who is receiving a private message and emits the private message to the recipient
	socket.on('private_message', function(user, username, message){
		so = socket_dict[user];
		so.emit('private_message_to_client', username, message);
	});

	//passes the link for an image to be displayed to all members of a room
	socket.on('upload', function(file, room_name, username){
		io.sockets.in(room_name).emit('upload_to_client',file, username);
	});

	//passes the emoji for all members of a room to see
	socket.on('emoji', function(emoji, room_name, username){
		io.sockets.in(room_name).emit('emoji_to_client', emoji, username);
	});

	//removes old name from the room_dict adds new name to room_dict and transfers all information assocaited with old room name to new room name
	socket.on('rename', function(room_name, new_name){
		room_dict[new_name] = room_dict[room_name];
		delete room_dict[room_name];
		for(u in room_dict[new_name]){
			var user = room_dict[new_name][u];
			socket_dict[user].leave(room_name);
			socket_dict[user].join(new_name);
		}
		passwords[new_name] = passwords[room_name];
		delete passwords[room_name];
		banned_dict[new_name] = banned_dict[room_name];
		delete banned_dict[room_name];
		io.sockets.emit('load_rooms_to_client',room_dict);
		io.sockets.in(new_name).emit('rename_to_client', new_name,room_dict[new_name]);

	});
});