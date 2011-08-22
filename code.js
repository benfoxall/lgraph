/*

This is a hacky mess.

The main point is :
	- generating is completely client side 
	- that canvas is more appropriate than pdf/svg for these graphs

I've been thinking of this since :
	https://twitter.com/benjaminbenben/status/80283100822781952

@benjaminbenben

*/

window.config = {
	scale:1.4
}


;(function(window,_,$){
	
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

		sharedKeys: function(collections){
			var keys = _.uniq(
				_.flatten(
					_.map(collections,function(o){
						return _.keys(o);
						}
					)
				)
			);
			keys.sort();
			return keys;
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
		valueArray: function(collections,keys){
			keys = keys || _.sharedKeys(collections);

			return _.map(keys,function(key){
				return _.map(collections, function(o){
					return parseInt(o[key],0) || 0;
				});
			});
		}
	});
	
	// draws another curved segment on the existing ones
	// (this doesn't deal with interpolating the start/end values)
	var drawSegment = function(ctx, width, current, data, label){

		var midwidth = width/2;

		ctx.beginPath();
		ctx.moveTo(0, current[0]);

		// draw line out
		ctx.bezierCurveTo(	midwidth, current[1],
							midwidth, current[1],
							width, current[2]);

		//update the current 
		for (var i = current.length - 1; i >= 0; i--){
			current[i] += data[i];
		};

		// then move back
		ctx.lineTo(width,current[2]);

		ctx.bezierCurveTo(	midwidth, current[1],
							midwidth, current[1],
							0, current[0]);

		ctx.fill();
		
		
		if(label){
			
			ctx.save();
			
			ctx.translate(0, current[0] - (data[0] / 2));
			ctx.rotate(-Math.atan((current[0] - current[1]) / 90));
			
			ctx.fillStyle = 'black';
			ctx.fillText('  ' + label, 0, 0);
			
			ctx.restore();
			
		}

	};
	
	
	// new approach
	// potentially can be run server side too
	// context callback will give the context of an appropriately sized
	// canvas element (might have been already drawn to)
	var canvasrenderer = function(previous, current, next, context_callback){
		
		var scale = window.config.scale;

		//consider making this in the method signature if we make it generic enough
		var timestamps = [previous, current, next];

		var artists = _.sharedKeys(timestamps);
		var values = _.valueArray(timestamps,artists);

		var totals = [0,0,0];
		_.each(values, function(arr){
			_.each(arr,function(v,i){
				totals[i] += v;
			});
		});
		var max_total = _.max(totals);
		var offsets = _.map(totals, function(t){
			return (max_total - t)/4;
		});
		
		var o1 = 0, o2 = 0, o3 = 0;
		_(values).each(function(delta,i){
			o1 += (delta[1] + delta[0]) / 2;
			o2 +=  delta[1];
			o3 += (delta[1] + delta[2]) / 2;
		});
		offsets = [o1,o2,o3];
		var max_offset = _.max(offsets);
		offsets = _.map(offsets,function(o){
			return (max_offset - o)/2;
		})

		var height = max_offset;// * scale;
		var width = 180;
		
		// height = 600;
		
		var ctx = context_callback(width, height);
		
		ctx.save();
		ctx.scale(scale,scale);

		//clear the canvas
		ctx.fillStyle = 'white';
		ctx.fillRect(0,0,width,height);
		

		// var current = [0,0,0];
		

		_(values).each(function(delta,i){
			var v1 = (delta[1] + delta[0]) / 2;
			var v2 =  delta[1];
			var v3 = (delta[1] + delta[2]) / 2;
			
			var data = [v1,v2,v3];
			
			var label;
			if(delta[1] > 15 && delta[1] > delta[0] && delta[1] > delta[2]){
				label = artists[i];
			}
			
			ctx.fillStyle = color(artists[i])
			
			drawSegment(ctx, width, offsets, data, label);
		});
		
		
		ctx.restore();
		
	}

	window.canvasrenderer = canvasrenderer;
	
	
	
	// this won't actually do anything with the current
	// implementation of jsonp callbacks - though there
	// is a nice way to approach this which I'm working
	// on for a different site.
	$.ajaxSetup({ cache: true });
	
	
	var api_request = function(method, params, processor){
		processor = processor || _.identity;

		var key = window.config.api_key;
		var endpoint = 'http://ws.audioscrobbler.com/2.0/?callback=?';

		$.extend(params,{
			method:method,
			api_key:key,
			format:'json'
		});

		var dfr = $.Deferred();

		$.getJSON(endpoint, params).done(function(json){
			json.error ? 
				dfr.reject(json.error) : 
				dfr.resolve(processor(json));

		}).fail(dfr.reject);

		return dfr.promise();
	};


	// api request wrappers		
	var lfm_api = {
		chart: function(user){
			return api_request('user.getweeklychartlist',{user:user}, function(data){
				try{
					var chart = data.weeklychartlist.chart
					chart.reverse();
					return chart;
				} catch(e){
					return [];
				}
			});
		},
		artists: function(user,from,to){
			return api_request('user.getweeklyartistchart', {user:user, from:from, to:to}, function(data){
				try{

					var artists = {};
					_(data.weeklyartistchart.artist).each(function(a){
						artists[a.name] = a.playcount;
					});

					return artists;
				} catch(e) {
					return {};
				}	
			});
		}
	}

	
	window.lfm_api = lfm_api;

})(window,_,$);








var date_in_words = function(seconds){
	var d = new Date(parseInt(seconds,10) * 1000);
	var month = {0:'January',1:'February',2:'March',3:'April',4:'May',5:'June',6:'July',7:'August',8:'September',9:'October',10:'November',11:'December'}[d.getMonth()];
	
	return d.getDate() + ' ' + month + ' ' + d.getFullYear();
}
$.fn.timestamp = function(chartdata,username){
	
	var $this = this;
	this.html('<span class="date">'+date_in_words(chartdata.from) + '</span>');
	this.addClass('unrequested');
	
	this.data('has-canvas', false);
	
	// --bind events
	// request - get information from the api
	this.bind('request', function(){
		var $el = $(this);
		$this.attr('class','requesting');
		lfm_api.artists(username, chartdata.from, chartdata.to).done(function(data){
			$el.data('artists', data);
			
			//trigger render events
			$el.trigger('render');
			$el.prev().trigger('render');
			$el.next().trigger('render');
			
			$this.attr('class','complete');
			
		}).fail(function(){
			$this.attr('class','error');
		});
	});
	
	// render - draw information (triggered from render)
	this.bind('render', function(){
		
		var $this = $(this);
		var previous = $this.prev().data('artists') || {};
		var next     = $this.next().data('artists') || {};
		var current  = $this.data('artists') || {};
		
		var context_callback = function(width, height){
			width  = width * window.config.scale;
			height = height * window.config.scale;
			if(!$this.data('has-canvas')){
				
				var canvas = $('<canvas height="'+height+'" width="'+width+'"></canvas>');
				$this.append(canvas);
				
				$this.data('has-canvas', true);
			}
			var c = $this.find('canvas').get(0);
			c.width = width;
			c.height = height;
			return c.getContext('2d');
		}
		canvasrenderer(previous, current, next, context_callback);
		
	});
	
	this.click(function(){
		$this.trigger('request');
	})
	
	return this;
}

// var timestamps = list(timestamp_proto);


// gives a colour that is the result of hashing the key
// very horrible at the moment, looks and implemenation
function color(key){
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
	
	var canvas = $('<canvas height="'+height+'" width="'+width+'"></canvas>');
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

			if(diff > 20){
				ctx.fillText(artist, width/2, y + (diff/2) - 10);	
			}
			
			y += diff;
		});
		
		
		ctx.restore();
		
		
	};
};


//display an error at the top of the page
var err = function(message,err){
	var rm = $('<button>x</button>').click(function(){
		$(this).parent().remove();
	});
	var content = $('<span>').text(message).prepend(rm);
	$('p.err').append(content);
	
	console && console.error(message, err || '');
}

var fetch = function(user){
	
	//get the list of weekly charts
	return lfm_api.chart(user).done(function(chart){
		
		
		$('#times').empty();
		
		for (var i=0; i < chart.length; i++) {
			
			$('<li>').timestamp(chart[i],user).appendTo($('#times'));
			
		};
				
	})
	
};


