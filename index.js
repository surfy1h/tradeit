const fs = require('fs');
var da = require('./dataAccess');
var common = require('./common');
var fun = require('./functions.js');
var async = require('async');
var _ = require('lodash');
var market_depth = 5;
var helpText = require('./help.json');
var PAGE_TOKEN = process.env.PAGE;
var VERIFY_TOKEN = process.env.TOKEN;

exports.handler = function(event, context) {
/// start FB integration

  // process GET request
  if(event.params && event.params.querystring){
    var queryParams = event.params.querystring;

    var rVerifyToken = queryParams['hub.verify_token']

    if (rVerifyToken === VERIFY_TOKEN) {
      var challenge = queryParams['hub.challenge']
      callback(null, parseInt(challenge))
    }else{
      callback(null, 'Error, wrong validation token');
    }
  }

/// end of FB integration

    var data = common.parseInputOrder(event.text); // Now we got data.command, data.product and data.price.
    exports.data = data;

    async.waterfall([

            function(nextStep) {
                console.log('Step 1 - Write into history');
                console.log(nextStep);
                da.myHistoryRecord(event, nextStep);
            },

            function(arg1, nextStep) {
                console.log('Step 2 - Identifying special command.');
                console.log(nextStep);
                if (arg1 == 'ok') {
                    switch (event.text.toLowerCase()) {
                        case "products":
                            da.getMyProductNames(nextStep);
                            break;
                        case "help":
                            finish(null, helpText);
                            break;
                        case "test":
                            finish(null, 'TEST OK');
                            break;
                        default:
                            nextStep(null, 'skipped', null);
                    }
                } else
                    nextStep('Special command not found.', null);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 3 - product list.');
                console.log(arg1);
                console.log(nextStep);
                if (arg1 == 'ok') {
                    var result = (fun.myDisplayProducts(rows));
                    finish(null, 'Available products: ' + result.toUpperCase());
                } else
                    nextStep(null);
            },

            function(nextStep) {
                console.log('Step 4 - Confirming existence of command.');
                console.log(nextStep);
                da.confirmMyCommand(data, nextStep);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 5 - In case of nonexistent command, it should stop here.');
                console.log(arg1);
                console.log(nextStep);
                if (arg1 == 'ok') {
                    result = fun.myIncomingCommand(rows);
                    if (result) finish(null, result);
                    nextStep(null);
                } else
                    nextStep(null);
            },

            function(nextStep) {
                console.log('Step 6 - Confirming existence of product.');
                console.log(nextStep);
                da.confirmMyProduct(data, nextStep);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 7 - In case of nonexistent product, it should stop here.');
                console.log(arg1);
                console.log(nextStep);
                if (arg1 == 'ok') {
                    result = fun.myIncomingProduct(rows);
                    if (result) finish(null, result);
                    nextStep(null);
                } else
                    nextStep(null);
            },

            function(nextStep) {
                console.log('Step 8 - In case of no price sent, it should do the check.');
                console.log(nextStep);
                if (!data.price) {
                    switch (data.command) {
                        case "BUY":
                            da.getAskPrices(data, nextStep);
                            break;
                        case "SELL":
                            da.getBidPrices(data, nextStep);
                            break;
                        default:
                            nextStep('Command not recognised!', null);
                    }
                    return;
                } else nextStep(null, 'ok', null);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 9 - Display prices on one of sides of orderbook.');
                console.log(arg1);
                console.log(nextStep);
                if (!data.price) {
                    switch (data.command) {
                        case "BUY":
                            result = fun.showAskPrices(rows);
                            if (result) finish(null, result);
                            //nextStep(null);
                            break;
                        case "SELL":
                            result = fun.showBidPrices(rows);
                            if (result) finish(null, result);
                            //nextStep(null);
                            break;
                        default:
                            nextStep('Command not recognised!', null);
                    }
                    //return;
                } else nextStep(null, 'ok', null);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 10 - Insert valid order into orderbook.');
                console.log(arg1);
                console.log(nextStep);
                console.log('Your order ' + data.command + ' ' + data.product + ' ' + data.price + ' successfully inserted!');
                da.insertOrder(data, nextStep);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 11A - Matchmaking time!');
                console.log(nextStep);
                da.deleteMatchedOrders(data, nextStep);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 11B - Was there a trade?!');
                console.log(nextStep);
                var match = rows.affectedRows;
                if (match == 2)
                    finishVisible(null, ':money_with_wings: Congratulations! You have just traded ' + data.product + ' for the price of ' + data.price + ' credits! :money_with_wings:');
                else nextStep(null, 'ok', null);
            },

            function(arg1, rows, nextStep) {
                console.log('Step 12 - Counting order, maybe there are too many of them.');
                console.log(nextStep);
                da.countOrders(data, nextStep);
            },

            function(arg1, rows, nextStep) {
                console.log(arg1);
                console.log('Step 13 - Evaluating amount of orders, deleting irrelevant, if found.');
                var totalOrders = _.values(rows);
                var irrelevantOrders = totalOrders - market_depth;
                console.log(totalOrders);
                if (totalOrders > market_depth) {
                    switch (data.command) {
                        case "BUY":
                            console.log('Irrelevant orders on bid side: ' + irrelevantOrders);
                            da.deleteLowestBid(data, nextStep);
                            break;
                        case "SELL":
                            console.log('Irrelevant orders on ask side: ' + irrelevantOrders);
                            da.deleteHighestAsk(data, nextStep);
                            break;
                        default:
                            nextStep(null);
                    }
                    return;
                } else nextStep(null, 'relevant', null);
            },

            function(arg1, rows, nextStep) {
                console.log(arg1);
                console.log('Step 14 - Final check.')
                if (arg1 == 'relevant')
                    finish(null, 'Thank you! Your order ' + data.command + ' ' + data.product + ' ' + data.price + ' was saved to the orderbook!');
                else {
                    finish(null, 'Your order ' + data.command + ' ' + data.product + ' ' + data.price + ' was accepted. As it brokes a limit of market depth ' + market_depth + ', irrelevant orders were automatically deleted.');
                }
            }

        ], function(err, result) {
            if (err)
                context.fail(err);
            context.succeed(result);
        }


    );

    function finish(err, result) { // Finish early (quit from async.waterfall).
        if (err)
            context.fail(err);
        context.succeed(result);
    }

    function finishVisible(err, result) { // Finish early and display message in Slack visible to others.
        if (err)
            context.fail(err);
        var visible = {
            "response_type": "in_channel",
            "text": "",
        };
        visible.text = result;
        context.succeed(visible);
    }
}