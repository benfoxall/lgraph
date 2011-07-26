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
	},
	
	// gets the union of keys in a list of collections
	// and returns the values of each of those keys 
	// indexed by the original collection index
	// 
	//   x = {a:1, b:2}, y = {a:5, c:10}
	//   _([x,y]).valueArray()
	//     => [[1,5],[2,0],[0,10]]
	//
	//   (ie. [x[a],y[a]],[x[b],y[b]],[x[c],y[c]] )
	valueArray: function(collections){
		var keys = _.uniq(
			_.flatten(
				_.map(collections,function(o){
					return _.keys(o);
					}
				)
			)
		);
		keys.sort();
		
		return _.map(keys,function(key){
			return _.map(collections, function(o){
				return parseInt(o[key],0) || 0;
			});
		});
	}
});


// This is a basic double linked list where each element
// is given the same prototype object
var list = function(proto){
	var $last, $proto = proto;
	return {
		push:function(args){
			var el = element($last);
			el.__proto__ = $proto;
			el.init && el.init(args);
			if($last) $last.next(el);
			return $last = el;
		},
		clear:function(){
			$last = null;
		},
		each:function(f){
			$last && $last._each(f);
		}
	}
	
	function element($prev){
		var $next;
		return {
			// won't work for nullifying a link, though
			// that doesn't matter too much here
			next:function(v){
				return v ? $next = v : $next;
			},
			prev:function(v){
				return v ? $prev = v : $prev;
			},
			_each:function(f){
				this.prev() && this.prev()._each(f);
				f(this);
			}
		}
	}
}

// Lets you build a linked list of timestamps and gives some
// functionality to compare the artists deltas between the
// timestamps.
//
// props to Ed for inspiration on the artists comparison
timestamp_proto = {
	request:function(){
		var timestamp = this;
		last_fm('user.getweeklyartistchart', {user:this.username, from:this.from, to:this.to}).done(function(data){
			try{
				var artists = {};
				_(data.weeklyartistchart.artist).each(function(a){
					artists[a.name] = a.playcount;
				});
				
				timestamp.artists(artists);
				
			} catch(e) {
				err('Unable to process',e);
			}
		});
	},
	artists:function(data){
		if(data){
			this.$artists = data;
			
			//setting the artists should cause some redrawing
			this.redraw();
			this.next && this.next.redraw();
			this.prev && this.prev.redraw();
		}
		return (this.$artists || {});
	},
	deltas: function(){
		var a = this.prev ? this.prev.artists() : {};
		var b = this.artists();
		var c = this.next ? this.next.artists() : {};
		
		// return _.valueArray([a,b,c]);
		
		var keys = _({}).chain()
					.extend({},a,b,c)
					.keys()
					.sort()
					.value();
		
		return keys.map(function(k){
			var a_v = parseInt(a[k], 10) || 0;
			var b_v = parseInt(b[k], 10) || 0;
			var c_v = parseInt(c[k], 10) || 0;
			
			return [k, a_v, b_v, c_v];
		})
		
	},
	plays:function(){ //the total number of plays at timestamp
		return _(_(this.artists()).map(function(value){
			return parseInt(value,10);
		})).sum();
	},
	view:function(what){
		this.$view = what;
	},
	redraw:function(){
		$('#t' + this.from).css('background-color','#fc0')
		this.$view && this.$view(this);
	}
};


var timestamps = list(timestamp_proto);


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
	
	var scale = 1.3;
	
	width  /= scale;
	height /= scale;
	
	return function(timestamp){
		if(!(canvas.get(0) && canvas.get(0).getContext)){
			return;
		}
		
		var h1,h2,h3;
		
		h2 = timestamp.plays();
		try{h1 = timestamp.prev.plays()} catch(e){}
		try{h3 = timestamp.next.plays()} catch(e){}
		
		canvas.get(0).height = _([h1||0,h2||0,h3||0,100]).max() * scale; //don't ask
		
		
		
		var ctx = canvas.get(0).getContext('2d');
		
		ctx.save();
		ctx.scale(scale,scale);
		
		//clear the canvas
		ctx.fillStyle = 'white';
		ctx.fillRect(0,0,width,height);
		
		
		
		var y1 = 0, y2 = 0, y3 = 0;
		var x1 = 0, x2 = width/2, x3 = width;
		
		_(timestamp.deltas()).each(function(delta){
			
			var artist = delta[0];
			var v1 = delta[1];
			var v2 = delta[2];
			var v3 = delta[3];
			
			
			var enter_y = (v1 + v2)/2;
			var exit_y  = (v2 + v3)/2;
			
			ctx.fillStyle = color(artist);
			
			ctx.beginPath();
			ctx.moveTo(x1,y1);
			ctx.lineTo(x1,y1 + enter_y);
			
			ctx.bezierCurveTo(x2,y2 + v2, x2,y2 + v2, x3,y3 + exit_y)
			
			ctx.lineTo(x3,y3);
			
			ctx.bezierCurveTo(x2,y2,x2,y2, x1,y1);

			ctx.fill();
			
			
			y1 += enter_y;
			y2 += v2;
			y3 += exit_y;
			
		});
		
		
		ctx.fillStyle = 'black';
		var y = 0;
		
		_(timestamp.deltas()).each(function(d){
			var artist = d[0], to = d[1], from = d[2];
			
			var diff = parseInt(from,10);

			// console.log(y,value, key)
			if(diff > 20){
				ctx.fillText(artist, width/2, y + (diff/2) - 10);	
			}
			
			y += diff;
		});
		
		
		ctx.restore();
		
		
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
function last_fm(method,params){
	
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
};

var fetch = function(username,count){
	
	//get the list of weekly charts
	last_fm('user.getweeklychartlist',{user:username}).done(function(data){
		
	 	window.chart = data.weeklychartlist.chart;
		chart.reverse();
		
		for (var i=0; i < chart.length; i++) {
			
			chart[i].prev = chart[i-1];
			chart[i].next = chart[i+1];
			chart[i].__proto__ = timestamp_proto;
			chart[i].username = username;
			// chart[i].view(view());
			
		};
		
		//create the dom elements for this to draw to
		$('#times').html(_(timestamps).reduce(function(memo, ts){
			return memo + '<li id="t'+ts.from+'"></li>';
		},''));
		
	})
	
};


