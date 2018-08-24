The McAfee Active Response (MAR) DXL Node-RED client package
includes JSON documents with sample Node-RED flows. To import samples into
Node-RED, perform the following steps:

1. In the upper-right corner of the Node-RED UI, press the side menu button.

1. Select one of examples under
   `Import → Examples → dxl mar-client` in the menu drop-down list.

In order for the sample flows to execute properly, Node-RED must be able to
connect to a DXL fabric. For more information on connecting to a DXL fabric
from Node-RED, see the
[Client Configuration](https://opendxl.github.io/node-red-contrib-dxl/jsdoc/tutorial-configuration.html)
section in the OpenDXL Node-RED package documentation.

See the following sections for an overview of each sample.

#### Basic Search (basic-search-example)

This sample executes a `McAfee Active Response` search for the IP addresses of
hosts that have an Active Response client installed.

#### Basic Paging (basic-paging-example)

This sample executes a `McAfee Active Response` search for the running processes
on a particular endpoint as specified by its IP address. The names of the
processes found are retrieved and captured one page (up to 5 items) at a time.
