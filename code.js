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
			this.prev() && this.prev().redraw();
		}
		return this.$artists;
	},
	deltas: function(ts){
		var from = this.artists() || {};
		var to = ts && ts.artists ? ts.artists() || {} : {};
		
		return _({}).chain()
			.extend(from,to)
			.keys()
			.sort()
			.uniq(true)
			.map(function(k){
				return [k, parseInt(from[k] || 0,10), parseInt(to[k] || 0,10)];
			}).value();
	},
	view:function(what){
		this.$view = what;
	},
	redraw:function(){
		this.$view && this.$view(this);
	}
});


var view = function(){
	var width = 180;
	var height = 600;
	
	var canvas = $('<canvas height="'+height+'" width="'+width+'" id="canvas"></canvas>');
	$("#display").append(canvas);
	
	var scale = 1;
	
	return function(t){
		//TODO check for support
		var timestamp = t;
		//console.log("VIEW", timestamp);
		var ctx = canvas.get(0).getContext('2d');
		
		ctx.fillStyle = 'white';
		ctx.fillRect(0,0,width,height);
		
		var left = timestamp.deltas(timestamp.prev());
		//console.log(left);
		
		var x = width;0;
		var x2 = 0; width / 2;
		
		var y1 = 0, y2 = 0;
		
		var from_total = 0, to_total = 0;
		
		_(left).each(function(d){
			var artist = d[0];
			var from = d[1];
			var to = d[2];
			
			// var m = (from + to) / 2;
			
			//draw
			
			ctx.fillStyle = color(artist);
			
			ctx.beginPath();
			ctx.moveTo(x,from_total);
			ctx.lineTo(x,from_total + from);
			
			ctx.lineTo(x2,to_total + to);
			ctx.lineTo(x2,to_total);
			ctx.fill();
			
			// ctx.moveTo(x,y1);
			// ctx.lineTo(x,y1 + y1diff);
			// ctx.lineTo(x2,y2 + y2diff);
			// ctx.lineTo(x2,y2);
			// ctx.lineTo(x,y1);
			// ctx.fill();
			
			
			// console.log(from_total, to_total, from, to);
			
			from_total += from;
			to_total += to;
			
			
			
			
			
			// var y1diff = scale * from;
			// var y2diff = scale * to;
			
			// ctx.beginPath();
			// ctx.moveTo(x,y1);
			// ctx.lineTo(x,y1 + y1diff);
			// ctx.lineTo(x2,y2 + y2diff);
			// ctx.lineTo(x2,y2);
			// ctx.lineTo(x,y1);
			// ctx.fill();
			
			// y1 += y1diff;
			// y2 += y2diff;
			
			
		});
		
		
        // var right = timestamp.deltas(timestamp.next());
        // console.log(right);
        // 
        // var x = width;
        // var x2 = width / 2;
        // 
        // var y1 = 0, y2 = 0;
        // _(right).each(function(d){
        //  var artist = d[0];
        //  var from = d[1];
        //  var to = d[2];
        //  
        //  var m = (from + to) / 2;
        //  
        //  
        //  ctx.fillStyle = color(artist);
        //  
        //  var y1diff = scale * from;
        //  var y2diff = scale * to;
        //  
        //  ctx.beginPath();
        //  ctx.moveTo(x,y1);
        //  ctx.lineTo(x,y1 + y1diff);
        //  ctx.lineTo(x2,y2 + y2diff);
        //  ctx.lineTo(x2,y2);
        //  ctx.lineTo(x,y1);
        //  ctx.fill();
        //  
        //  y1 += y1diff;
        //  y2 += y2diff;
        //  
        //  
        // })
	
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
		
		/*var sem = count;
		
		for (var i=0; i < count; i++) {
			var timespan = chart.pop();
			
			if(!timespan){
			  break;
			};
			
			var handle = function(){
				var num = i;
				return function(data){
					try{
					//Run some code here
						var artists = data.weeklyartistchart.artist;
						
						artists.sort(function(a,b){
							return a.name < b.name ? -1 : 1;
						})
						
						chart_data[num] = $.map(artists, function(a){
							return {name:a.name, plays:a.playcount};
						});
					
					} catch(e) {	
						chart_data[num] = [];
						err('Unable to process');
					}
					
					sem--;
					$('#times').text(sem + " left");
					
					if(!sem){
						render();
						$('#times').text("");
					}
				}
			}();
			
			
			last_fm('user.getweeklyartistchart', {user:username, from:timespan.from, to:timespan.to}).done(handle)
			
		};*/
		
	})
	
};


// the logic here is really hard to explain without a pen and paper/wall.
// though essentially it gives the difference between play counts at a 
// given interval.
//
// I'm sure that there is a lovely way to do this, and it may involve a
// more appropriate data structure.  The main advantage here is that it
// won't be 'too' affected by the number of unique artists over time.
var deltas = function(){
	var prev = [];
	return _(chart_data).map(function(curr){
		var output = [];
		
		var i = 0, j = 0;
		while(i < prev.length || j < curr.length){
			var A = prev[i];
			var B = curr[j];
			
			if(!A && !B){
				break;
				
			} else if(!A || (B && A.name > B.name)){
				//use B
				output.push({
					name:B.name,
					from:0,
					to:parseInt(B.plays)
				});
				j++;
			} else if (!B || (A && B.name > A.name)){
				//use A
				output.push({
					name:A.name,
					from:parseInt(A.plays),
					to:0
				});
				i++;
			} else {
				
				output.push({
					name:A.name,
					from:parseInt(A.plays),
					to:parseInt(B.plays)
				});
				i++;
				j++;
			}
		}
		
		prev = curr;
		
		return output;
		
	});
}

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
	
	return "rgba("+Math.min(r,256)+","+Math.min(g,256)+","+Math.min(b,256)+",0.6)"
	
}

// The actual drawing stuff - took a few different approaches here (it shows).
var render = function(){
/*	
	var interval_width = 180;
	
	var width = chart_data.length * interval_width;
	var height = 600;
	
	//possibly quite expensive
	var chart_deltas = deltas();
	
	var totals = _(chart_deltas).map(function(data){
		var values = _(data).map(function(d){
			// not quite right, though pessimistic, so will do for now
			return Math.max(d.from,d.to); 
		});
		return _(values).sum();
	})	
	var max = _(totals).max();
	
	var scale = height / max;
	
	$("#display").html('<canvas height="'+height+'" width="'+width+'" id="canvas"></canvas>');
	var canvas = $('canvas').get(0);
	
	
	if (canvas.getContext){
		
		var ctx = canvas.getContext('2d');
		var x = 0;
		
		
		_(chart_deltas).each(function(chart_delta){
			
			var y1 = 0, y2 = 0;
			_(chart_delta).each(function(delta){
				
				ctx.fillStyle = color(delta.name);
				
				var y1diff = scale * delta.from;
				var y2diff = scale * delta.to;
				
				ctx.beginPath();
				ctx.moveTo(x,y1);
				ctx.lineTo(x,y1 + y1diff);
				ctx.lineTo(x + interval_width,y2 + y2diff);
				ctx.lineTo(x + interval_width,y2);
				ctx.lineTo(x,y1);
				ctx.fill();
				
				
				y1 += y1diff;
				y2 += y2diff;
			})
			
			x += interval_width;
			
		});
		
	} else {
		err('No Canvas Support');
	};
	*/
};


