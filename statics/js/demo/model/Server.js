var Server = (function(){

    var Server = extend( PacketHolder, function(name, locations, options) {
    
        PacketHolder.apply(this, arguments);

        this.timeBetweenPackets = asFunction(options.timeBetweenPackets);
        this.packetMode = asFunction( options.packetMode, 'live' );
    
        this.initialDelay = options.initialDelay;
        this.messageSize = options.messageSize;
        this.packetNumberAfter = options.packetSequence || function(previousPacketNumber){
            return      (previousPacketNumber === undefined)
                ?   0
                :   previousPacketNumber+1;
        };
    });
    
    function asFunction(givenValue, defaultValue) {
        
        if (typeof givenValue == 'function') {
            return givenValue;
        }
        
        var constantValue = ( givenValue !== undefined )? givenValue : defaultValue;
        
        return function(){return constantValue};
    }
    
    Server.prototype.accept = function(packet){
    
        if( packet.direction == 'upstream' ) {
            this.sendResponse();
            packet.done();
        }
    };
    Server.prototype.createMessagesOut = function(direction) {
        var destinations = this.nextLocationsInDirection(direction);
    
        return destinations.map(function(){
            return new Message().inDemo(this.demo).sentBy(this);
        }.bind(this));
    };
    
    Server.prototype.sendCopiesOfPacket = function(basePacket, messages, nextLocations){
    
        var packetCopies = this.createCopiesForDestinations( basePacket, nextLocations );
    
        messages.forEach(function( message, i ){
            message.includes(packetCopies[i]);
        });
    
        announceAll(packetCopies);
    
        this.sendPacketsToDestinations(packetCopies, nextLocations);
    };
    
    Server.prototype.openOutboundMessages = function(direction, createPacket){
    
        var nextLocations = this.nextLocationsInDirection(direction),
            messages = this.createMessagesOut(direction),
            timeForNextPacket = this.events('timeForNextPacket');
    
        var sendNext = function(/* any arguments */){
    
            var basePacket = createPacket.apply(this, arguments);
            this.sendCopiesOfPacket(basePacket, messages, nextLocations);
            basePacket.done();
    
        }.bind(this);
    
        timeForNextPacket.on( sendNext );
    
        this.events('reset').on(function() {
            timeForNextPacket.un(sendNext);
        });
    
        announceAll(messages);
    };
    
    Server.prototype.responsePacketGenerator = function() {
    
        var firstPacketCreated = false;
    
        return function(curPacketNumber) {
            // unannounced packet to use as a template for others
            var ordering = {
                i:       curPacketNumber,
                isFirst: !firstPacketCreated,
                isLast:  curPacketNumber >= (this.messageSize -1)
            };
    
            var packet = new Packet(
                'response' + curPacketNumber
                ,   'JSON'
                ,   'downstream'
                ,   ordering
                ,   this.packetMode(curPacketNumber)
            ).inDemo(this.demo);
    
            firstPacketCreated = true;
    
            return packet;
        }
    };
    
    Server.prototype.sendResponse = function() {
    
        this.openOutboundMessages('downstream', this.responsePacketGenerator());
    
        function sendNext(previousPacketNumber){
    
            var curPacketNumber = this.packetNumberAfter(previousPacketNumber);
    
            this.events('timeForNextPacket').emit(curPacketNumber);
    
            // schedule the next packet if there is one:
            if( curPacketNumber < (this.messageSize -1) ) {
                var nextPacketNumber = this.packetNumberAfter(curPacketNumber);
                this.schedule(
                    sendNext.bind(this, curPacketNumber)
                    ,   this.timeBetweenPackets(nextPacketNumber)
                );
            }
        }
    
        this.schedule( sendNext.bind(this), this.initialDelay );
    };

    return Server;
}());