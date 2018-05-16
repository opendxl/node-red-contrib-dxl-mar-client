'use strict'

var bootstrap = require('@opendxl/dxl-bootstrap')
var nodeRedDxl = require('@opendxl/node-red-contrib-dxl')
var marClient = require('@opendxl/dxl-mar-client')
var MarClient = marClient.MarClient
var ResultsContext = marClient.ResultsContext
var NodeUtils = nodeRedDxl.NodeUtils

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

  function getResults (node, nodeConfig, msg, resultsContext) {
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
            msg.payload = nodeRedDxl.MessageUtils.objectToReturnType(
              searchResult.items, node._returnType)
            msg.hasMoreItems = msg.offset < resultsContext.resultCount
            if (!msg.hasMoreItems) {
              clearSearchResultProperties(msg)
            }
            node.send(msg)
          } else {
            sendError(node, msg, resultError.message)
          }
        },
        msg.offset,
        NodeUtils.valueToNumber(nodeConfig.limit, msg.limit),
        NodeUtils.defaultIfEmpty(nodeConfig.textFilter, msg.textFilter),
        NodeUtils.defaultIfEmpty(nodeConfig.sortBy, msg.sortBy),
        NodeUtils.defaultIfEmpty(nodeConfig.sortDirection, msg.sortDirection)
      )
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

    this._returnType = nodeConfig.returnType || 'obj'

    var error = null

    this._projections = null
    if (nodeConfig.projections) {
      try {
        this._projections = bootstrap.MessageUtils.jsonToObject(
          nodeConfig.projections)
      } catch (err) {
        error = err
      }
    }

    var node = this

    this.status({
      fill: 'red',
      shape: 'ring',
      text: 'node-red:common.status.disconnected'
    })

    if (!error && !this._client) {
      error = 'Missing client configuration'
    }

    if (error) {
      this.error(error)
    } else {
      this._client.registerUserNode(this)
      var marClient = new MarClient(this._client.dxlClient)
      var pollInterval = NodeUtils.valueToNumber(nodeConfig.pollInterval)
      if (!isNaN(pollInterval)) {
        marClient.pollInterval = pollInterval
      }
      this.on('input', function (msg) {
        var projections = NodeUtils.defaultIfEmpty(node._projections,
          msg.projections)
        if (msg.searchNodeId === node.id) {
          var resultsContext = new ResultsContext(marClient,
            msg.searchId, msg.resultCount, msg.errorCount, msg.errorCount,
            msg.hostCount, msg.subscribedHostCount)
          getResults(node, nodeConfig, msg, resultsContext)
        } else if (projections) {
          msg.offset = 0
          msg.hasMoreItems = false
          marClient.search(projections, msg.conditions,
            function (searchError, resultsContext) {
              delete msg.projections
              delete msg.conditions
              if (resultsContext) {
                msg.searchId = resultsContext.searchId
                msg.resultCount = resultsContext.resultCount
                msg.errorCount = resultsContext.errorCount
                msg.hostCount = resultsContext.hostCount
                msg.subscribedHostCount = resultsContext.subscribedHostCount
                msg.searchNodeId = node.id
                if (resultsContext.hasResults) {
                  getResults(node, nodeConfig, msg, resultsContext)
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
        } else {
          sendError(node, msg, 'projections property was not specified')
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
    }
  }

  RED.nodes.registerType('dxl-mar-search', MarSearchNode)
}
