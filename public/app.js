jQuery(function($){    
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */

    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );
            IO.socket.on('newWordData', IO.onNewWordData);
            IO.socket.on('hostCheckAnswer', IO.hostCheckAnswer);
            IO.socket.on('updatePlayerScores', IO.updatePlayerScores);
            IO.socket.on('gameOver', IO.gameOver);
            IO.socket.on('error', IO.error );
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
            App.mySocketId = IO.socket.socket.sessionid;
            // console.log(data.message);
        },

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen funciton.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.
            App[App.myRole].updateWaitingScreen(data);
        },

        /**
         * Both players have joined the game.
         * @param data
         */
        beginNewGame : function(data) {
            App[App.myRole].gameCountdown(data);
        },

        /**
         * A new set of words for the round is returned from the server.
         * @param data
         */
        onNewWordData : function(data) {
            if (data.newMode) {
                $('#secondsLeftMessage').text("");
                $('#secondsLeft').text("");
                $('#answer').text("");
                $('#hostWord').text("");
                //Switch to new mode
                var text;
                if (data.newMode == "simpleAnswer") {
                    text = "Part 1: Pick the correct option";
                } else if (data.newMode == "multipleChoice") {
                    text = "Part 2: ";
                } else if (data.newMode == "ordering") {
                    text = "Part 3: ";
                }
                $('#question').text(text);

                if(App.myRole === 'Player') {
                    $('#gameArea')
                        .html('<div class="gameOver">Get Ready!</div>');
                }
                
            } else {
                var timePerRound = 10; //time per question
                var timeToShowAnswer = 5;

                // Update the current round
                App.currentRound = data.round;
                $('#answer').text(""); //reset answer
                $('#hostWord').text("");

                // Change the word for the Host and Player
                App[App.myRole].newWord(data);
                App.Host.currentQuestionType = data.questionType;                

                // Show answer on screen
                var $secondsLeft;
                if (App.myRole === 'Host') {
                    $secondsLeft = $('#secondsLeft');
                } else if(App.myRole === 'Player') { 
                    $secondsLeft = 0;
                }
                App.countDown( $secondsLeft, timePerRound, function(){
                    if(App.myRole === 'Player') {
                        $('#gameArea')
                            .html('<div class="gameOver">Time\'s up!</div>');
                    }
                    App.Host.checkAnswers();

                    // App.countDown( null, timeToShowAnswer, function(){
                    //     //IO.socket.emit('hostCountdownFinished', App.gameId);
                        
                    //     // Advance the round
                    //     App.currentRound += 1;

                    //     // Prepare data to send to the server
                    //     var data = {
                    //         gameId : App.gameId,
                    //         round : App.currentRound
                    //     }

                    //     // Notify the server to start the next round.
                    //     IO.socket.emit('hostNextRound',data);
                    // });
                });
            }            
        },

        /**
         * A player answered. If this is the host, check the answer.
         * @param data
         */
        hostCheckAnswer : function(data) {
            if(App.myRole === 'Host') {
                App.Host.storeAnswer(data);
            }
        },

        updatePlayerScores : function(data) {
            if(App.myRole === 'Player' && data != null && data.length != 0) {
                var player = _.find(data, { mySocketId : App.Player.playerId });
                App.Player.updateScore(player.score);
            }
        },

        /**
         * Let everyone know the game has ended.
         * @param data
         */
        gameOver : function(data) {
            App[App.myRole].endGame(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }

    };

    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',   // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        mySocketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentRound: 0,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();

            // Initialize the fastclick library
            FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$hostGame = $('#host-game-template').html();
            App.$endGame = $('#end-game-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host
            App.$doc.on('click', '#btnTitleScreen', App.Host.onTitleScreenClick);
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);
            App.$doc.on('click', '#btnStartGame', App.Host.hostStartGame);
            App.$doc.on('click', '#wordArea', App.Host.hostStartSection);

            // Player
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.on('click', '.btnAnswer',App.Player.onPlayerAnswerClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial Anagrammatix Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            //App.doTextFit('.title');
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * A reference to the correct answer for the current round.
             */
            currentCorrectAnswer: '',
            
            onTitleScreenClick: function () { 
                App.$gameArea.html(App.$templateNewGame);
                App.Host.onCreateClick();
            },
            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                // console.log('Clicked "Create A Game"');
                IO.socket.emit('hostCreateNewGame');
            },

            hostStartGame : function(data) {
                // console.log('Room is full. Almost ready!');

                // Let the server know that two players are present.
                IO.socket.emit('hostRoomFull',App.gameId);
            },

            hostStartSection : function() {
                App.currentRound += 1;
                var data = {
                            gameId : App.gameId,
                            round : App.currentRound
                        }
                IO.socket.emit('hostNextRound',data);
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;

                App.Host.displayNewGameScreen();
                // console.log("Game started with ID: " + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$templateNewGame);

                // Display the URL on screen
                $('#gameURL').text(window.location.href);
                App.doTextFit('#gameURL');

                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                var existingPlayer = _.find(App.Host.players, {'mySocketId': data.mySocketId});

                if (!existingPlayer) {
                    // If this is a restarted game, show the screen.
                    if ( App.Host.isNewGame ) {
                        App.Host.displayNewGameScreen();
                    }
                    // Update host screen
                    $('.table [id='+ data.tableNumber +'] .list')
                        .append(data.playerName + '    ');

                    // Store the new player's data on the Host.
                    App.Host.players.push(data);

                    // Increment the number of players in the room
                    App.Host.numPlayersInRoom += 1;
                }
            },

            /**
             * Show the countdown screen
             */
            gameCountdown : function() {

                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);
                App.doTextFit('#hostWord');

                $('#secondsLeftMessage').text("ARE YOU READY?");
                App.doTextFit('#secondsLeftMessage');

                // Begin the on-screen countdown timer
                var $secondsLeft = $('#hostWord');
                App.countDown( $secondsLeft, 3, function(){
                    $('#secondsLeftMessage').text();
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });

                // Game has started
                
                // Display the players' names on screen
                // $('#player1Score')
                //     .find('.playerName')
                //     .html(App.Host.players[0].playerName);

                // _.forEach(App.Host.players, function(player, index) {
                //     App.Host.players[index].score = 0;
                //     $('#playerScores')
                //         .append('<div id="' + player.mySocketId + '" class="playerScore"><span class="score">0</span><span class="playerName">' + player.playerName + '</span></div>');
                // });

                // $('#player2Score')
                //     .find('.playerName')
                //     .html(App.Host.players[1].playerName);

                // Set the Score section on screen to 0 for each player.
                // $('#player1Score').find('.score').attr('id',App.Host.players[0].mySocketId);
                // $('#player2Score').find('.score').attr('id',App.Host.players[1].mySocketId);
                
            },

            /**
             * Show the word for the current round on screen.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newWord : function(data) {
                // Insert the new word into the DOM
                $('#question').text(data.word);
                //App.doTextFit('#hostWord');

                // Start a new round after a specific interval
                var $secondsLeft = $('#secondsLeft');
                App.doTextFit('#secondsLeft');

                $('#secondsLeftMessage').text("Time left this round: ");

                // Update the data for the current round
                App.Host.currentCorrectAnswer = data.answer;
                App.Host.currentRound = data.round;
                App.Host.playerAnswers = [];
                App.Host.currentAnswerChoices = data.list;
            },

            /**
             * Check the answer clicked by a player.
             * @param data{{round: *, playerId: *, answer: *, gameId: *}}
             */
            storeAnswer : function(data) {
                data.timeLeft = App.currentRoundTimeLeft;
                App.Host.playerAnswers[data.playerId] = data;
            },

            checkAnswers : function() {
                // Verify that the answer clicked is from the current round.
                // This prevents a 'late entry' from a player whos screen has not
                // yet updated to the current round.

                if (App.Host.currentQuestionType === "simpleAnswer" || App.Host.currentQuestionType === "ordering") {
                    App.Host.scoreAnswer();

                    //display answers
                    $('#answer').text("Answer: " + App.Host.currentCorrectAnswer);
                } else if (App.Host.currentQuestionType === "multipleChoice") {
                    //determine who voted for each answer type
                    var answers = {};
                    _.forEach(App.Host.currentAnswerChoices, function(choice) {
                        answers[choice] = 0;
                    });

                    for (var player in App.Host.playerAnswers) {
                        var playerAnswer = App.Host.playerAnswers[player];
                        if (isNaN(answers[playerAnswer.answer])) {
                            answers[playerAnswer.answer] = 1;
                        } else {
                            answers[playerAnswer.answer]++;
                        }
                    };

                    var answersArray = [];
                    for (var key in answers) {
                        answersArray.push({
                            name: key,
                            value: answers[key]
                        });
                    }
                    var sorted = answersArray.sort(function(a, b) {
                        return (a.value > b.value) ? -1 : ((b.value > a.value) ? 1 : 0)
                    });
                
                    App.Host.currentCorrectAnswer = sorted[0].name;

                    //display answers
                    var displayAnswers = "";
                    _.forEach(sorted, function(answer) {
                        displayAnswers += "<p>"+answer.name+" "+answer.value+"</p>";
                    });
                    $('#answer').html(displayAnswers);

                    App.Host.scoreAnswer();
                } 

                IO.socket.emit('updateScores',App.Host.players);
            },

            scoreAnswer : function() {
                for (var player in App.Host.playerAnswers) {
                    var playerAnswer = App.Host.playerAnswers[player];
                    if (playerAnswer.round === App.currentRound){

                        // Get the player's score
                        // var $pScore = $('#' + playerAnswer.playerId).find('.score'); //TODO: remove, we don't want to show score on screen

                        // Advance player's score if it is correct
                        if( App.Host.currentCorrectAnswer === playerAnswer.answer ) {
                            var player = _.find(App.Host.players, { mySocketId : playerAnswer.playerId });
                            if (player.score) {
                                player.score += playerAnswer.timeLeft;
                            } else {
                                player.score = playerAnswer.timeLeft;
                            }
                            // $pScore.text( player.score ); //TODO: remove, we don't want to show score on screen
                        } else {
                            // A wrong answer was submitted, so decrement the player's score.
                            //$pScore.text( +$pScore.text() - 3 );
                        }                        
                    }
                };
            },

            /**
             * All 10 rounds have played out. End the game.
             * @param data
             */
            endGame : function(data) {
                //put each player into respective arrays
                var scoresByTable = [];
                _.forEach(App.Host.players, function(player) {
                    if (!scoresByTable[player.tableNumber]) {
                        scoresByTable[player.tableNumber] = new Array();
                    }
                    scoresByTable[player.tableNumber].push(player);
                });

                var topScoreByTable = [];
                _.forEach(scoresByTable, function(table, tableNumber) {
                    var winner = _.maxBy(table, function(player) {
                        return player.score || 0;
                    });
                    if (winner && tableNumber) {
                        topScoreByTable[tableNumber] = winner;
                    }                    
                });

                var grandWinner = _.maxBy(topScoreByTable, function(player) {
                    return (player && player.score) || 0;
                });

                // var playersOrderedByScore = _.sortBy(App.Host.players, [function(player) {
                //     return player.score || 0;
                // }]);

                // // Find the winner based on the scores
                // var winner = _.maxBy(playersOrderedByScore, function(player) {
                //     return player.score || 0;
                // });

                App.$gameArea.html(App.$endGame);

                 _.forEach(topScoreByTable, function(table, tableNumber) {
                    if (table) {
                        $('#' + tableNumber + ' .list').text(table.playerName + ' (Score: ' + (table.score || 0) + ')');
                    }
                 });

                 $('#winnerName').text(grandWinner.playerName + ' from table ' + grandWinner.tableNumber + ' (Score: ' + grandWinner.score + ')');

                // Clear other divs
                // $('#answer').text("");
                // $('#question').text("");
                // $('#secondsLeft').text("");
                // $('#secondsLeftMessage').text("");

                // Display the winner (or tie game message)
                // $('#hostWord').text( winner.playerName + ' Wins!!' );
                // App.doTextFit('#hostWord');

                // Reset game data
                App.Host.numPlayersInRoom = 0;
                App.Host.isNewGame = true;
            },

            /**
             * A player hit the 'Start Again' button after the end of a game.
             */
            restartGame : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',

            /**
             * Click handler for the 'JOIN' button
             */
            playerId: '',
            tableNumber: '',
            intermediateAnswer: [],
            intermediateAnswerClicks: 0,
            onJoinClick: function() {
                // console.log('Player clicked "Start"');

                if (!$('#inputPlayerName').val() || !$('#inputPlayerTable').val()) {
                    $('#playerWaitingMessage')
                        .html('<p/>')
                        .text('Please enter name and table# to continue.');
                } else {
                    // collect data to send to the server
                    var data = {
                        gameId : 123456,
                        playerName : $('#inputPlayerName').val() || 'anon',
                        tableNumber : $('#inputPlayerTable').val()
                    };

                    // Send the gameId and playerName to the server
                    IO.socket.emit('playerJoinGame', data);

                    // Set the appropriate properties for the current player.
                    App.myRole = 'Player';
                    App.Player.myName = data.playerName;
                    App.Player.playerId = App.mySocketId;
                    App.Player.tableNumber = data.tableNumber;
                }
            },

            /**
             *  Click handler for the Player hitting a word in the word list.
             */
            onPlayerAnswerClick: function() {
                // console.log('Clicked Answer Button');
                var $btn = $(this);      // the tapped button
                var answer = $btn.val(); // The tapped word

                if (App.Host.currentQuestionType === "ordering") {
                    if (answer === 'reset') {
                        App.Player.intermediateAnswerClicks = 0;
                        App.Player.intermediateAnswer = [];
                        $('#ulAnswers .btnAnswer').css({"color": ""});
                    } else {
                        App.Player.intermediateAnswer[App.Player.intermediateAnswerClicks] = answer;
                        App.Player.intermediateAnswerClicks++;

                        $('#ulAnswers [value='+answer+']').css({"color": "red"});

                        if (App.Player.intermediateAnswerClicks == 4) {
                            var aggregateAnswer = App.Player.intermediateAnswer.toString();
                            App.Player.sendAnswer(aggregateAnswer);
                        }
                    }
                } else {
                    App.Player.sendAnswer(answer);
                }                
            },

            sendAnswer: function(answer) {
                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.Player.playerId,
                    answer: answer,
                    round: App.currentRound
                }
                IO.socket.emit('playerAnswer',data);
            },

            /**
             *  Click handler for the "Start Again" button that appears
             *  when a game is over.
             */
            onPlayerRestart : function() {
                var data = {
                    gameId : App.gameId,
                    playerName : App.Player.myName
                }
                IO.socket.emit('playerRestart',data);
                App.currentRound = 0;
                $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                if(IO.socket.socket.sessionid === data.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;

                    $('#playerWaitingMessage')
                        .html('<p/>')
                        .text('Joined success! Please wait for game to begin.');
                }
            },

            /**
             * Display 'Get Ready' while the countdown timer ticks down.
             * @param hostData
             */
            gameCountdown : function(hostData) {
                App.Player.hostSocketId = hostData.mySocketId;
                $('#gameArea')
                    .html('<div class="gameOver">Get Ready!</div>');
            },

            /**
             * Show the list of words for the current round.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newWord : function(data) {
                // Create an unordered list element
                var $list = $('<ul/>').attr('id','ulAnswers');

                // Insert a list item for each word in the word list
                // received from the server.
                $.each(data.list, function(index){
                    $list                                //  <ul> </ul>
                        .append( $('<li/>')              //  <ul> <li> </li> </ul>
                            .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                                .addClass('btnAnswer')   //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .addClass('btn')         //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .addClass('btn' + index)
                                .val(this)               //  <ul> <li> <button class='btnAnswer' value='word'> </button> </li> </ul>
                                .html(this)              //  <ul> <li> <button class='btnAnswer' value='word'>word</button> </li> </ul>
                            )
                        )
                });

                if (data.questionType == "ordering") {
                    $list.append( $('<li/>').append( $('<button/>').addClass('btnAnswer reset').addClass('btn').val('reset').html('Reset')));
                    App.Player.intermediateAnswer = [];
                    App.Player.intermediateAnswerClicks = 0;
                }

                // Insert the list onto the screen.
                $('#gameArea').html($list);
            },

            timesUp : function() {
                $('#gameArea')
                            .html('<div class="gameOver">Time\'s up!</div>');
            },

            updateScore : function(data) {
                App.Player.score = data;
            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function(data) {
                $('#gameArea')
                    .html('<div class="gameOver">Your score: ' + (App.Player.score || 0) + '</div>');
                    // .append(
                    //     // Create a button to start a new game.
                    //     $('<button>Start Again</button>')
                    //         .attr('id','btnPlayerRestart')
                    //         .addClass('btn')
                    //         .addClass('btnGameOver')
                    // );
            }
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {
            App.currentRoundTimeLeft = startTime;

            // Display the starting time on the screen.
            if ($el) {
                $el.text(startTime);
            }
            
            if(App.myRole === 'Host') {
                App.doTextFit('#hostWord');
            }

            // console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                App.currentRoundTimeLeft -= 1;

                if ($el) {
                    $el.text(App.currentRoundTimeLeft);
                }
                
                if(App.myRole === 'Host') {
                    App.doTextFit('#hostWord');
                }

                if( App.currentRoundTimeLeft <= 0 ){
                    // console.log('Countdown Finished.');

                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }

        },

        /**
         * Make the text inside the given element as big as possible
         * See: https://github.com/STRML/textFit
         *
         * @param el The parent element of some text
         */
        doTextFit : function(el) {
            textFit(
                $(el)[0],
                {
                    alignHoriz:true,
                    alignVert:false,
                    widthOnly:true,
                    reProcess:true,
                    maxFontSize:300
                }
            );
        }

    };

    IO.init();
    App.init();

}($));
