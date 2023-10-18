const express = require('express');
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const { v1: uuidv1 } = require('uuid');
const rp = require('request-promise');
const cors = require('cors');  // Added the CORS middleware
const path = require('path');  // Added path module
const crypto = require('crypto');
const uuid = require('uuid/v1'); // For generating unique transaction IDs


const app = express();
const port = process.env.PORT || 3000;
const nodeAddress = uuidv1().split('-').join('');

const bitcoin = new Blockchain();

app.use(bodyParser.json());
app.use(cors()); // Enable CORS


// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Get the entire blockchain
app.get('/blockchain', (req, res) => {
  res.json(bitcoin);
});

// Create a new transaction
app.post('/transaction', (req, res) => {
  try {
    // Parse the transaction data from the request body
    const transactionData = req.body;

    // Check for duplicates based on both the ID and the details
    const existingTransactionById = bitcoin.pendingTransactions.find(
      (transaction) => transaction.id === transactionData.id
    );

    const existingTransactionByDetails = bitcoin.pendingTransactions.find(
      (t) =>
        t.studentId === transactionData.studentId &&
        t.computerId === transactionData.computerId &&
        t.action === transactionData.action
    );

    if (existingTransactionById || existingTransactionByDetails) {
      return res.status(400).json({ error: 'Duplicate transaction.' });
    } else {
      // Create a transaction by passing the transaction data
      const transaction = bitcoin.createTransaction(transactionData);

      res.json({ note: 'Transaction added to pending transactions.' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Mine a new block
app.get('/mine', (req, res) => {
  const { miningRewardAddress } = req.query;

  try {
    bitcoin.minePendingTransactions(miningRewardAddress || nodeAddress);
    res.json({ note: 'Block mined successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Register a new node and broadcast to the network
app.post('/register-and-broadcast-node', (req, res) => {
  const { newNodeUrl } = req.body;

  if (!bitcoin.networkNodes.includes(newNodeUrl) && newNodeUrl !== bitcoin.currentNodeUrl) {
    bitcoin.networkNodes.push(newNodeUrl);
  }

  const promises = bitcoin.networkNodes.map((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + '/register-node',
      method: 'POST',
      body: { newNodeUrl: newNodeUrl },
      json: true,
    };

    return rp(requestOptions);
  });

  Promise.all(promises)
    .then(() => {
      const bulkRegisterOptions = {
        uri: newNodeUrl + '/register-nodes-bulk',
        method: 'POST',
        body: { allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl] },
        json: true,
      };

      return rp(bulkRegisterOptions);
    })
    .then(() => {
      res.json({ note: 'New node registered with the network successfully.' });
    });
});

// Register a node with the network
app.post('/register-node', (req, res) => {
  const { newNodeUrl } = req.body;

  if (!bitcoin.networkNodes.includes(newNodeUrl) && newNodeUrl !== bitcoin.currentNodeUrl) {
    bitcoin.networkNodes.push(newNodeUrl);
  }

  res.json({ note: 'New node registered successfully.' });
});

// Register multiple nodes at once
app.post('/register-nodes-bulk', (req, res) => {
  const { allNetworkNodes } = req.body;

  allNetworkNodes.forEach((networkNodeUrl) => {
    if (!bitcoin.networkNodes.includes(networkNodeUrl) && networkNodeUrl !== bitcoin.currentNodeUrl) {
      bitcoin.networkNodes.push(networkNodeUrl);
    }
  });

  res.json({ note: 'Bulk registration successful.' });
});

// Consensus - resolve conflicts and achieve consensus among nodes
app.get('/consensus', (req, res) => {
  const promises = bitcoin.networkNodes.map((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + '/blockchain',
      method: 'GET',
      json: true,
    };

    return rp(requestOptions);
  });

  Promise.all(promises)
    .then((blockchains) => {
      const currentChainLength = bitcoin.chain.length;
      let maxChainLength = currentChainLength;
      let newLongestChain = null;
      let newPendingTransactions = null;

      blockchains.forEach((blockchain) => {
        if (blockchain.chain.length > maxChainLength && bitcoin.chainIsValid(blockchain.chain)) {
          maxChainLength = blockchain.chain.length;
          newLongestChain = blockchain.chain;
          newPendingTransactions = blockchain.pendingTransactions;
        }
      });

      if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
        res.json({
          note: 'Current chain has not been replaced.',
          chain: bitcoin.chain,
        });
      } else {
        bitcoin.chain = newLongestChain;
        bitcoin.pendingTransactions = newPendingTransactions;
        res.json({
          note: 'This chain has been replaced.',
          chain: bitcoin.chain,
        });
      }
    });
});

// Add a student
app.post('/add-student', (req, res) => {
  const { studentId, name, privateKey } = req.body;

  // Check if required fields are provided
  if (!studentId || !name || !privateKey) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Check if a student with the same ID already exists
  if (bitcoin.students[studentId]) {
    return res.status(400).json({ error: 'Student with the same ID already exists.' });
  }

  // Create a new student and add it to the blockchain
  try {
    bitcoin.addStudent({
      id: studentId,
      name: name,
      privateKey: privateKey,
    });
    res.json({ note: 'Student added successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Add a computer
app.post('/add-computer', (req, res) => {
  const { computerId, name } = req.body;

  // Check if required fields are provided
  if (!computerId || !name) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Check if a computer with the same ID already exists
  if (bitcoin.computers[computerId]) {
    return res.status(400).json({ error: 'Computer with the same ID already exists.' });
  }

  // Create a new computer and add it to the blockchain
  try {
    bitcoin.addComputer({
      id: computerId,
      name: name,
      action: 'Available', // Set the initial state
    });
    res.json({ note: 'Computer added successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get block by blockHash
app.get('/block/:blockHash', (req, res) => {
  const blockHash = req.params.blockHash;
  const block = bitcoin.getBlockByHash(blockHash); // Implement the getBlockByHash method in your Blockchain class
  if (block) {
    res.json(block);
  } else {
    
    res.status(404).json({ error: 'Block not found.' });

  }
});

// Get transaction by transactionId
app.get('/transaction/:transactionId', (req, res) => {
  const transactionId = req.params.transactionId;
  const transaction = bitcoin.getTransactionById(transactionId); // Implement the getTransactionById method in your Blockchain class
  if (transaction) {
    res.json(transaction);
  } else {
    res.status(404).json({ error: 'Transaction not found.' });
  }
});

// Get address by address
app.get('/address/:address', (req, res) => {
  const address = req.params.address;
  const addressData = bitcoin.getAddressData(address); // Implement the getAddressData method in your Blockchain class
  if (addressData) {
    res.json(addressData);
  } else {
    res.status(404).json({ error: 'Address not found.' });
  }
});
// Block explorer
app.get('/block-explorer', (req, res) => {
  res.sendFile('./block-explorer/index.html', { root: __dirname });
});



// Start the server
app.listen(port, () => {
  console.log(`Blockchain node server is running on port ${port}`);
});
