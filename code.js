/*

This is a hacky mess.

The main point is :
	- generating is completely client side 
	- that canvas is more appropriate than pdf/svg for these graphs

I've been thinking of this since :
	https://twitter.com/benjaminbenben/status/80283100822781952

@benjaminbenben

*/


// simple extension to underscore that I use somewhere
_.mixin({
	sum : function(list) {
		return _(list).reduce(function(a,b){
			return a + b;
		},0);
	},
	
	//I'm not proud of this
	params: function(querystring){
		var params = {};
		if(querystring){
			var parts = querystring.substr(1).split('&');
			_(parts).each(function(part){
				var kv = part.split('=');
				params[kv[0]] = kv[1];
			})
		}
		return params;
	}
});


// A (double linked) list wrapper, this lets you link together 
// objects of the same prototype.
var list = function(proto, prev){
	var $proto = proto, $prev = prev, $next;
	return {
		create:function(){
			if($next){
				return $next.create()
			} else {
				$next = list($proto, this);
				$next.__proto__ = $proto;
				return $next;	
			}
		},
		next:function(){
			return $next;
		},
		prev:function(){
			return $prev;
		}
	};
};


// Lets you build a linked list of timestamps and gives some
// functionality to compare the artists deltas between the
// timestamps.
//
// props to Ed for inspiration on the artists comparison
//
// Not actually used yet. Though is going to make things crazy
// good when it is.
var timestamps = list({
	artists:function(data){
		if(data){
			this.$artists = data;
			//also invalidate prev/next
			this.redraw();
			
			this.next() && this.next().redraw();
			this.prev() && this.prev().redraw && this.prev().redraw();
		}
		return (this.$artists || {});
	},
	deltas: function(ts){
		var from = this.artists();
		var to = {};
		if(ts && ts.artists){
			to = ts.artists();
		}
		
		// var to = ts && ts.artists ? ts.artists() || {} : {};
		
		return _({}).chain()
			.extend(from,to)
			.keys()
			.sort()
			.uniq(true)
			.map(function(k){
				var v_from = parseInt(from[k] || 0,10);
				var v_to = parseInt(to[k] || 0,10);
				return [k, v_from, v_to];
			}).value();
	},
	view:function(what){
		this.$view = what;
	},
	redraw:function(){
		this.$view && this.$view(this);
	}
});


// gives a colour that is the result of hashing the key
// very horrible at the moment, looks and implemenation
var color = function(key){
	var h = 0;
	for (var i=0; i < key.length; i++) {
		h = (h + key.charCodeAt(i)) % 768;
	};
	
	var r = parseInt(Math.abs(h < 512 ? h : (h - 768)));
	var g = parseInt(Math.abs(h - 256));
	var b = parseInt(Math.abs(h - 512));
	
	return "rgba("+Math.min(r,256)+","+Math.min(g,256)+","+Math.min(b,256)+",0.9)"
	
}


var view = function(){
	var width = 180;
	var height = 600;
	
	var canvas = $('<canvas height="'+height+'" width="'+width+'" id="canvas"></canvas>');
	$("#display").append(canvas);
	
	var scale = 1;
	
	return function(timestamp){
		
		//TODO check for support
		var ctx = canvas.get(0).getContext('2d');
		
		//clear the canvas
		ctx.fillStyle = 'white';
		ctx.fillRect(0,0,width,height);
		
		
		var draw = function(data, x1, x2){
			var y1 = 0; var y2 = 0;
			
			_(data).each(function(d){
				var artist = d[0], from = d[1], to = d[2];
				
				var exit_y = (from + to)/2;
				
				ctx.fillStyle = color(artist);
				
				ctx.beginPath();
				ctx.moveTo(x1,y1);
				ctx.lineTo(x1,y1 + from);

				ctx.lineTo(x2,y2 + exit_y);
				ctx.lineTo(x2,y2);
				ctx.fill();

				y1 += from;
				y2 += exit_y;
				
			});
			
		};
		
		var left = timestamp.deltas(timestamp.prev());
		draw(left, width/2, 0);
		
		var right = timestamp.deltas(timestamp.next());
		draw(right, width/2, width);
		
	};
}



// this won't actually do anything with the current
// implementation of jsonp callbacks - though there
// is a nice way to approach this which I'm working
// on for a different site.
$.ajaxSetup({ cache: true });


//display an error at the top of the page
var err = function(message,err){
	var rm = $('<button>x</button>').click(function(){
		$(this).parent().remove();
	});
	var content = $('<span>').text(message).prepend(rm);
	$('p.err').append(content);
	
	console && console.error(message, err || '');
}


// A rudimentary wrapper round last fm web services
// returns a deferred object (not the ajax request - 
// as this may resolve okay, but still have errors)
var last_fm = function(method,params){
	
	var key = 'c2899b0774a2eda7769be6eefddd94b6';
	var endpoint = 'http://ws.audioscrobbler.com/2.0/?callback=?';
	
	$.extend(params,{
		method:method,
		api_key:key,
		format:'json'
	});
	
	var dfr = $.Deferred();
	
	$.getJSON(endpoint, params).done(function(json){
		if(json.error){
			err('API ' + method + ", error: " + json.error);
			dfr.reject(json.error);
		} else {
			dfr.resolve(json);
		}
	}).fail(dfr.reject);
	
	return dfr.promise();
}


var chart_data;


// 1. Get the weeks availible
// 2. Get the artist chart for each week
var fetch = function(username,count){
	chart_data = [];
	
	//get the list of weekly charts
	last_fm('user.getweeklychartlist',{user:username}).done(function(data){
		var chart = data.weeklychartlist.chart;
		chart.reverse();
		_(chart).each(function(week,i){
			if(i > count){
				return;//unbreakable from _v1.1.3
			}
			
			
			//hack the renderer and timestamp together
			// timestamp.view(view());
			
			var timestamp = timestamps.create();
			timestamp.view(view());
			timestamp.TESTVAR = i;
			
			last_fm('user.getweeklyartistchart', {user:username, from:week.from, to:week.to}).done(function(data){
				try{
					var artists = _(data.weeklyartistchart.artist).reduce(function(memo, a){
						memo[a.name] = a.playcount;
						return memo;
					},{});
					
					timestamp.artists(artists);
					
				} catch(e) {
					err('Unable to process',e);
				}
			});
			
		});
		
	})
	
};


