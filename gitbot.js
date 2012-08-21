#!/usr/bin/env node

var http = require('http');
var qs = require('querystring');

var irc = require('irc');

var servers = {};
var httpd = false;
var repos = {};

var arguments = process.argv.slice(2);
for(var i=0; i<arguments.length; i++){
	var flag=arguments[i], value, j=arguments[i].indexOf('=');
	if(j!==-1){
		value = flag.substr(j+1);
		flag = flag.substr(0,j);
	}
	switch(flag){
		case '--help':
			printHelp();
			return;
		case '--join':
			addChannel(value||arguments[++i]);
			continue;
		case '--httpd-port':
			httpd=parseInt(value||arguments[++i]);
			continue;
		case '--watch':
		case '--watchGithub':
			addGitHubRepo(value||arguments[++i]);
			continue;
	}
	throw new Error('Unhandled argument: '+args.length[i]);
}

function addChannel(string){
	var m = string.match(/^([^@]+)@([^\/]+)\/(.+)$/);
	var server = m[2];
	var channel = m[3];
	var nickname = m[1];
	console.log('Join: '+channel+' on '+server+' as '+nickname);
	if(!servers[nickname+'@'+server]){
		servers[nickname+'@'+server] = {nickname:nickname, server:server, channels:[]};
	}
	servers[nickname+'@'+server].channels.push(channel);
}

function addGitHubRepo(string){
	var m = string.match(/^<([^>]+)>\|(([^@]+)@([^\/]+)\/(.+))$/);
	console.log('Watch: '+m[1]+' pipe to '+m[4]+'/'+m[5]);
	var repo = m[1];
	var server = m[3]+'@'+m[4];
	var channel = m[5];
	if(!repos[repo]){
		repos[repo] = [];
	}
	if(!servers[server]) throw new Error('Unknown server: '+server);
	repos[repo].push({server: servers[server], channel: channel});

}

function processRequest(req, res){
	var data = '';
	req.on('data', function(chunk){
		data+=chunk.toString();
	});
	req.on('end', function(){
		console.log('data: %j',data);
		if(!data.length) return res.end("\\m/");
		var parsed = qs.parse(data);
		console.log('parsed: %j',parsed);
		if(!parsed || !parsed.payload) return res.end("\\m/");
		try{
			var event = JSON.parse(parsed.payload);
		}catch(e){
			return res.end("\\m/");
		}
		console.log(event);
		event.commits.forEach(function(commit){
			var fileCount = commit.added.length + commit.modified.length + commit.removed.length;
			var files = "("+fileCount+" files)";
			// commit.id.substr(0,10)
			var targets = repos[event.repository.url];
			var message = "\x033"+commit.committer.name+"\x03 \x037"+event.ref.replace('refs/heads/','')+"\x03 \x0310"+files+"\x03: "+commit.message+" - "+commit.url;
			targets.forEach(function(s){
				s.server.connection.notice(s.channel, message);
			});
			console.log(message);
		});
		res.end("\\m/");
	});
}

for(var server in servers){
	console.log('Connecting: '+servers[server].server+' '+servers[server].nickname+' '+servers[server].channels.join(' '));
	servers[server].connection = new irc.Client(servers[server].server, servers[server].nickname, {
		 channels: servers[server].channels,
	});
	servers[server].connection.on('error', function(){console.error(arguments);})
}

if(httpd){
	http.createServer(processRequest).listen(httpd);
}

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err.stack);
});
