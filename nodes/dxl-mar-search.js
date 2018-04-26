'use strict'

var marClient = require('@opendxl/dxl-mar-client')
var MarClient = marClient.MarClient
var ResultsContext = marClient.ResultsContext

module.exports = function (RED) {
  function clearSearchResultProperties (msg) {
    delete msg.offset
    delete msg.limit
    delete msg.searchId
    delete msg.searchNodeId
  }

  function sendError (node, msg, errorMessage) {
    clearSearchResultProperties(msg)
    node.error(errorMessage, msg)
  }

  function getResults (node, msg, resultsContext) {
    if (!msg.hasOwnProperty('offset')) {
      msg.offset = 0
    }
    if (msg.offset >= resultsContext.resultCount) {
      msg.hasMoreItems = false
    } else {
      resultsContext.getResults(
        function (resultError, searchResult) {
          if (searchResult) {
            msg.offset += searchResult.items.length
            msg.payload = searchResult.items
            msg.hasMoreItems = msg.offset < resultsContext.resultCount
            if (!msg.hasMoreItems) {
              clearSearchResultProperties(msg)
            }
            node.send(msg)
          } else {
            sendError(node, msg, resultError.message)
          }
        }, msg.offset, msg.limit, msg.textFilter, msg.sortBy, msg.sortDirection)
    }
  }

  function MarSearchNode (nodeConfig) {
    RED.nodes.createNode(this, nodeConfig)

    /**
     * Handle to the DXL client node used to make requests to the DXL fabric.
     * @type {Client}
     * @private
     */
    this._client = RED.nodes.getNode(nodeConfig.client)

    var node = this

    this.status({
      fill: 'red',
      shape: 'ring',
      text: 'node-red:common.status.disconnected'
    })

    if (this._client) {
      this._client.registerUserNode(this)
      var marClient = new MarClient(this._client.dxlClient)
      this.on('input', function (msg) {
        if (msg.searchNodeId === node.id) {
          var resultsContext = new ResultsContext(marClient,
            msg.searchId, msg.resultCount, msg.errorCount, msg.errorCount,
            msg.hostCount, msg.subscribedHostCount)
          getResults(node, msg, resultsContext)
        } else if (msg.hasOwnProperty('payload')) {
          msg.offset = 0
          msg.hasMoreItems = false
          marClient.search(msg.payload, msg.conditions,
            function (searchError, resultsContext) {
              delete msg.conditions
              if (resultsContext) {
                msg.searchId = resultsContext.searchId
                msg.resultCount = resultsContext.resultCount
                msg.errorCount = resultsContext.errorCount
                msg.hostCount = resultsContext.hostCount
                msg.subscribedHostCount = resultsContext.subscribedHostCount
                msg.searchNodeId = node.id
                if (resultsContext.hasResults) {
                  getResults(node, msg, resultsContext)
                } else {
                  msg.payload = []
                  clearSearchResultProperties(msg)
                  node.send(msg)
                }
              } else {
                sendError(node, msg, searchError.message)
              }
            }
          )
        }
      })
      this.on('close', function (done) {
        node._client.unregisterUserNode(node, done)
      })
      if (this._client.connected) {
        this.status({
          fill: 'green',
          shape: 'dot',
          text: 'node-red:common.status.connected'
        })
      }
    } else {
      this.error('Missing client configuration')
    }
  }

  RED.nodes.registerType('dxl-mar-search', MarSearchNode)
}
