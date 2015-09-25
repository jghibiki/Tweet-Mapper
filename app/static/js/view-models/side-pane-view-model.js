define(["ko", "mapWrapper", "chain"], function(ko, MapWrapperModule, chain){

    function SidePanelViewModel(){
        var self = this;

        self._shown = false;
        self._disposed = false;
        self._loading = false;
        self._loadTimer = null;
        self._deleteTimer = null;


        self._pos = new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|5AB300")
        self._neg = new google.maps.MarkerImage("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|B30000")

        self.map = MapWrapperModule.get().map;
        self.tweets = ko.observableArray([]);
        self.tweets.extend({rateLimit: 1000});
        self.tweetFeatureMap = []

        self.selectedTweet = ko.observable()
        self.selectedTweetTags = ko.computed(function(){
            if(self.selectedTweet() !== null && self.selectedTweet() !== undefined){
                var tags = ""
                for(var x=0; x< self.selectedTweet().entities.hashtags.length; x++){
                    tags = (tags + "#" + self.selectedTweet().entities.hashtags[x].text + " ");
                }
                return tags
            }
            return "No tags."
        });

        self.polarityFilter = ko.observable()
        self.tagFilterRaw = ko.observable("")
        self.tagFilter = ko.computed(function(){
            if(self.tagFilterRaw() !== undefined 
                || self.tagFilterRaw() !== null){
                return self.tagFilterRaw().replace("#", "").replace(" ", "").split(",");
            }
            else{
                return null;
            }
        })

        self.polarityFilterSubscription = self.polarityFilter.subscribe(function(value){
            for(var x=0; x < self.tweetFeatureMap.length; x++){
                if(value !== "both"){
                    if(self.tweetFeatureMap[x].tweet.classification !== value){
                        self.tweetFeatureMap[x].marker.setVisible(false);
                    }
                    if(self.tweetFeatureMap[x].tweet.classification === value){
                        self.tweetFeatureMap[x].marker.setVisible(true);
                    }
                }
                else{
                    self.tweetFeatureMap[x].marker.setVisible(true);
                }
            }
        });

        self.tagFilterSubscription = self.tagFilter.subscribe(function(value){
            if(value !== null && value !== undefined && value.length > 0){
                for(var x=0; x<self.tweetFeatureMap.length; x++){
                    var hasTag = false;
                    for(var y=0; y<self.tweetFeatureMap[x].tweet.entities.hashtags.length; y++){
                        for(var z=0; z<value.length; z++){
                            if(self.tweetFeatureMap[x].tweet.entities.hashtags[y] === value[z]){
                                hasTag = true;
                                break;
                            }
                        }
                        if(hasTag){
                            break;
                        }
                    }
                    if(hasTag){
                        self.tweetFeatureMap[x].marker.setMap(self.map());
                    }
                    else{
                        self.tweetFeatureMap[x].marker.setMap(null);
                    }
                }
            }
        });


        self.confidenceRatingFilter = ko.observable(0)

        self.confidenceRatingFilterSubscription = self.confidenceRatingFilter.subscribe(function(value){
            var numVal = Number(value); 

            for(var x=0; x<self.tweetFeatureMap.length; x++){
                if(Math.abs(self.tweetFeatureMap[x].tweet.rating) >= numVal){
                    self.tweetFeatureMap[x].marker.setMap(self.map());
                }
                else{
                    self.tweetFeatureMap[x].marker.setMap(null); 
                }
            }
        }); 
    

        self.tweetSubscription = self.tweets.subscribe(function(changedTweets){
            changedTweets.forEach(function(change){
                if(change.status === "added"){
                    if(!(change.value in self.tweets())){

                    }
                }
            });
        }, null, "arrayChange");


        self.shown = function(){
            if(!self._shown){
                
                self.getTweets();
                
                self._loadTimer = setInterval(self.getTweets, 60000);
                self._shown = true;
            }
        }

        self.hidden = function(){
            if(self._shown){
                self._shown = false;

                clearTimer(self._loadTimer);
                clearTimer(self._deleteTimer);
            } 
        }

        self.dispose = function(){
            if(!self._disposed){
                self.hidden();
                self._map = null;
                self._dispoed = true;
            }
        }

        self.getTweets = function(){
            if(!self._loading){
                self._loading = true;
                chain.get()
                    .cc(function(context, abort, next){
                        console.log("Deleting expired tweets.");
			self.tweets([]);
                        for(var x=0; x < self.tweetFeatureMap.length; x++){
			    self.tweetFeatureMap[x].marker.setMap(null);
			    self.tweetFeatureMap[x];
                        }
			self.tweetFeatureMap = [];

                        next();
                    })
                    .cc(function(context, abort, next){
                        console.log("Loading new tweets.");
                        $.ajax({
                            url: "/tweets/0",
                            type: "GET",
                            dataType: "json",
                            success: function(response){
                                context.response = response;
                                next(context);
                            },
                            error: function(error){
                                self._loading = false;
                                abort();
                            }
                        });
                })
                .cc(function(context, error, next){
                    var json = context.response
                    for(tweet in json["result"]){
                        json["result"][tweet].process_date = new Date(Date(json["result"][tweet].process_date)) 
                        self.tweets.push(json["result"][tweet]);

			var icon = null;
			if(json["result"][tweet].classification === "pos"){
			    icon = self._pos; 
			}
			else if (json["result"][tweet].classification == "neg"){
			    icon = self._neg;
			}
			else{
			    icon = self._pos;
			}
			
			var marker = new google.maps.Marker({
			    position: {lat: json["result"][tweet].coordinates.coordinates[1],
			    	   lng: json["result"][tweet].coordinates.coordinates[0]},
			    map: self.map(),
			    icon: icon
			})

			marker.addListener("click", self.selectTweet);

			self.tweetFeatureMap.push({
			    tweet: json["result"][tweet], 
			    marker: marker,
			    animation: google.maps.Animation.DROP
			})

                    }

                    next();
                })
                .end({}, function(){
                    self._loading = false;   
                });
            }
        }

        

        self.selectTweet = function(){
            for(var x=0; x< self.tweetFeatureMap.length; x++){
                if(self.tweetFeatureMap[x].marker === this){
                    self.selectedTweet(self.tweetFeatureMap[x].tweet);
                    break;
                }
            }
        }

        self.clearSelectedTweet = function(){
            self.selectedTweet(null);
        }
    }

    return {
        get: function(){
            return new SidePanelViewModel();
        },
        type: function(){
            return SidePanelViewModel;
        }
    };
});
