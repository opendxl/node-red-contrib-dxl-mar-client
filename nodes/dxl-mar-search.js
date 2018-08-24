/**
 * @module DxlMarSearch
 * @description Implementation of the `dxl-mar-search` node
 * @private
 */
'use strict'

var bootstrap = require('@opendxl/dxl-bootstrap')
var nodeRedDxl = require('@opendxl/node-red-contrib-dxl')
var marClient = require('@opendxl/dxl-mar-client')
var MarClient = marClient.MarClient
var ResultsContext = marClient.ResultsContext
var NodeUtils = nodeRedDxl.NodeUtils

/**
 * @classdesc Used to access to the results of a MAR search.
 * @external ResultsContext
 * @see {@link https://opendxl.github.io/opendxl-mar-client-javascript/jsdoc/ResultsContext.html}
 * @private
 */

/**
 * Clear properties from the message which are used only when iterating
 * through the results of a MAR search. This is called when the last page
 * of results for a search has been reached in order to avoid polluting
 * further searches which may be done in the same flow with the content
 * from the initial search.
 * @param {Object} msg - Message to remove properties from.
 * @private
 */
function clearSearchResultProperties (msg) {
  NodeUtils.removeProperties(msg,
    ['offset', 'limit', 'textFilter', 'sortBy', 'sortDirection',
      'searchId', 'searchNodeId'])
}

/**
 * Send an error result for a search. Properties which are no longer needed
 * in the message are removed and an error is set for the supplied search
 * node.
 * @param {Object} node - The MAR search node to send the error for.
 * @param {Object} msg - Message to pass through to any catch nodes which
 *   may receive the error.
 * @param {String} errorMessage - Message to include in the error.
 * @private
 */
function sendError (node, msg, errorMessage) {
  clearSearchResultProperties(msg)
  node.error(errorMessage, msg)
}

/**
 * Retrieve a particular set of results from a MAR search. If an additional
 * page of results is available, the results are delivered in a `msg` to the
 * outputs for the supplied MAR search node.
 * @param {Object} node - The MAR search node.
 * @param {String} node._returnType - Controls the data type for the result
 *   payload, set as `msg.payload`. If returnType is 'bin', `msg.payload` is a
 *   raw binary Buffer. If returnType is 'txt', `msg.payload` is a String
 *   (decoded as UTF-8). If returnType is 'obj', is an Object (decoded as a JSON
 *   document from the original payload). If an error occurs when attempting to
 *   convert the binary Buffer of the payload into the desired data type, the
 *   current flow is halted with an error.
 * @param {Object} nodeConfig - Configuration data which the MAR search node
 *   uses.
 * @param {Number} [nodeConfig.limit] - Maximum number of items to return in the
 *   results. If the value is empty, the limit will be derived from the
 *   `msg.limit` parameter.
 * @param {String} [nodeConfig.textFilter] - Text based filter used to limit the
 *   result (this can be any string). If the value is empty, the limit will be
 *   derived from the `msg.textFilter` parameter.
 * @param {String} [nodeConfig.sortBy] - Field that will be used to sort the
 *   results. If the value is empty, the limit will be derived from the
 *   `msg.sortBy` parameter.
 * @param {String} [nodeConfig.sortDirection] - Direction the search results
 *   should be sorted. If the value is empty, the sort direction will be
 *   retrieved from the `msg.sortDirection` parameter.
 * @param {Object} msg - Message to pass along to the MAR search node's
 *   output node(s).
 * @param {Number} [msg.offset=0] - Current offset (0-based) into the search
 *   results from which to read the next available set of results. This value is
 *   incremented for the additional results which are received.
 * @param {Boolean} msg.hasMoreItems - Whether or not more items are available
 *   to retrieve from the search results. This value is set to `false` if
 *   the set of results which are received are the last available for the
 *   search.
 * @param {Number} [msg.limit] - Maximum number of items to return in the
 *   results. If a non-empty value is set for the `nodeConfig.limit` parameter,
 *   the value in the `nodeConfig.limit` parameter is used instead of the value
 *   in this parameter.
 * @param {String} [msg.textFilter] - Text based filter used to limit the
 *   result (this can be any string). If a non-empty value is set for the
 *   `nodeConfig.textFilter` parameter, the value in the `nodeConfig.textFilter`
 *   parameter is used instead of the value in this parameter.
 * @param {String} [msg.sortBy] - Field that will be used to sort the
 *   results. If a non-empty value is set for the `nodeConfig.sortBy` parameter,
 *   the value in the `nodeConfig.sortBy` parameter is used instead of the value
 *   in this parameter.
 * @param {String} [msg.sortDirection] - Direction the search results should be
 *   sorted. If a non-empty value is set for the `nodeConfig.sortDirection`
 *   parameter, the value in the `nodeConfig.sortDirection` parameter is used
 *   instead of the value in this parameter.
 * @param {external:ResultsContext} resultsContext - Object which contains the
 *   results from a MAR search.
 * @private
 */
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
      {
        offset: msg.offset,
        limit: NodeUtils.valueToNumber(nodeConfig.limit, msg.limit),
        textFilter: NodeUtils.defaultIfEmpty(nodeConfig.textFilter,
          msg.textFilter),
        sortBy: NodeUtils.defaultIfEmpty(nodeConfig.sortBy, msg.sortBy),
        sortDirection: NodeUtils.defaultIfEmpty(nodeConfig.sortDirection,
          msg.sortDirection)
      }
    )
  }
}

module.exports = function (RED) {
  /**
   * @classdesc Node which executes a search via McAfee Active Response.
   * @param {Object} nodeConfig - Configuration data which the MAR search node
   *   uses.
   * @param {String} nodeConfig.client - Id of the DXL client configuration node
   *   that this node should be associated with.
   * @param {String} [nodeConfig.projections] - JSON-formatted array of objects
   *   used to describe the information to collect in the search. If the value
   *   is empty, the projections will be derived from the input message's
   *   `msg.projections` property.
   * @param {Number} [nodeConfig.limit] - Maximum number of items to return in
   *   the results. If the value is empty, the limit will be derived from the
   *   `msg.limit` parameter.
   * @param {String} [nodeConfig.textFilter] - Text based filter used to limit
   *   the result (this can be any string). If the value is empty, the limit
   *   will be derived from the `msg.textFilter` parameter.
   * @param {String} [nodeConfig.sortBy] - Field that will be used to sort the
   *   results. If the value is empty, the limit will be derived from the
   *   `msg.sortBy` parameter.
   * @param {String} [nodeConfig.sortDirection] - Direction the search results
   *   should be sorted. If the value is empty, the sort direction will be
   *   retrieved from the `msg.sortDirection` parameter.
   * @param {Number} [nodeConfig.pollInterval] - Controls the number of seconds
   *   between poll requests made to the MAR server to determine when a search
   *   is complete.
   * @param {String} [nodeConfig.returnType=obj] - Controls the data type for
   *   the result payload, set as `msg.payload`. If returnType is 'bin',
   *   `msg.payload` is a raw binary Buffer. If returnType is 'txt',
   *   `msg.payload` is a String (decoded as UTF-8). If returnType is 'obj', is
   *   an Object (decoded as a JSON document from the original payload). If an
   *   error occurs when attempting to convert the binary Buffer of the payload
   *   into the desired data type, the current flow is halted with an error.
   * @private
   * @constructor
   */
  function MarSearchNode (nodeConfig) {
    RED.nodes.createNode(this, nodeConfig)

    /**
     * Handle to the DXL client node used to make requests to the DXL fabric.
     * @type {Client}
     * @private
     */
    this._client = RED.nodes.getNode(nodeConfig.client)

    /**
     * Controls the data type for the result payload.
     * @type {String}
     * @private
     */
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
          NodeUtils.extractProperty(msg, 'projections'))
        var conditions = NodeUtils.extractProperty(msg, 'conditions')
        // If the `searchNodeId` property on the incoming message matches
        // this node's id, this node is receiving a message for a search
        // that it previously performed. This happens when the node is
        // re-entered to retrieve the second or later set of results from
        // a previously initiated search.
        if (msg.searchNodeId === node.id) {
          // Continuation of a previous search. Get the next page of results
          // and send them along to the output nodes.
          var resultsContext = new ResultsContext(marClient,
            msg.searchId, msg.resultCount, msg.errorCount, msg.errorCount,
            msg.hostCount, msg.subscribedHostCount)
          getResults(node, nodeConfig, msg, resultsContext)
        } else if (projections) {
          // Start a new search since a previous one had not been initiated
          // from this node.
          msg.offset = 0
          msg.hasMoreItems = false
          marClient.search(projections, conditions,
            function (searchError, resultsContext) {
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
