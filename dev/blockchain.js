const crypto = require('crypto');
const uuid = require('uuid/v1'); // For generating unique transaction IDs
const fs = require('fs');

class Transaction {
    constructor(studentId, computerId, action) {
        this.id = uuid(); // Generate a unique ID for each transaction
        this.studentId = studentId;
        this.computerId = computerId;
        this.action = action;
        this.timestamp = new Date().toISOString();
       // this.signature = ''; // Placeholder for digital signature
    
    }


    signTransaction(privateKey) {
        
        // Create a digital signature for the transaction using the student's private key
        const sign = crypto.createSign('sha256');
        sign.update(this.id + this.studentId + this.computerId + this.action + this.timestamp);
        try{
        this.signature = sign.sign(privateKey, 'hex');
        }catch (error) {
            res.status(500).json({ error: 'Sign ' + error.message });
        }

    }

    isValidSignature() {
        // Verify the digital signature of the transaction
        if (!this.signature || this.signature === '') {
            return false;
        }
        const verify = crypto.createVerify('sha256');
        verify.update(this.id + this.studentId + this.computerId + this.action + this.timestamp);
        return verify.verify(this.studentId, this.signature, 'hex');
    }
}

class Block {
    constructor(index, transactions, previousHash = '', difficulty = 4) {
        this.index = index;
        this.timestamp = new Date().getTime();
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.difficulty = difficulty; // Adjust the difficulty here
        this.nonce = 0; // Initialize nonce to 0
        this.hash = this.calculateHash();
    }

    calculateHash() {
        const data = this.index + this.timestamp + JSON.stringify(this.transactions) + this.previousHash + this.nonce;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    mineBlock() {
        while (this.hash.substring(0, this.difficulty) !== Array(this.difficulty + 1).join('0')) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.pendingTransactions = [];
        this.students = this.loadStudents('students.json');
        this.computers = this.loadComputers('computers.json');
        this.miningReward = 100;
    }

    createGenesisBlock() {
        return new Block(0, [], '0', 0); // Added a timestamp and set difficulty to 0 for the genesis block
    }


    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock) {
        const latestBlock = this.getLatestBlock();
        if (newBlock.index !== latestBlock.index + 1) {
            throw new Error('Invalid block index.');
        }
        if (newBlock.previousHash !== latestBlock.hash) {
            throw new Error('Invalid block previous hash.');
        }
        this.chain.push(newBlock);
    }

    minePendingTransactions(miningRewardAddress) {
        if (this.pendingTransactions.length === 0) {
            throw new Error('No pending transactions to mine.');
        }

        // // Check if pending transactions are valid
        // for (const transaction of this.pendingTransactions) {
        //     if (!transaction.isValidSignature()) {
        //         throw new Error('Invalid transaction signature.');
        //     }
        // }

        const rewardTransaction = new Transaction('', miningRewardAddress, 'Mining Reward');
        this.pendingTransactions.push(rewardTransaction);

        const newBlock = new Block(
            this.getLatestBlock().index + 1,
            this.pendingTransactions,
            this.getLatestBlock().hash
        );

        newBlock.mineBlock();
        this.chain.push(newBlock);

        this.pendingTransactions = [];
    }

    createTransaction(transactionData) {
        // Validate and process the transactionData to create a new Transaction object
        const { studentId, computerId, action, privateKey } = transactionData;
        
      
        // Check if the student and computer exist and perform necessary validations
        if (!this.students[studentId] || !this.computers[computerId]) {
          throw new Error('Invalid student or computer.');
        }
      
        const student = this.students[studentId];
        const computer = this.computers[computerId];
      
        if (!student.is_active) {
          throw new Error('Invalid student.');
        }
      
        if (
          (action === 'Borrow' && computer.action === 'Borrowed') ||
          (action === 'Return' && computer.action !== 'Borrowed')
        ) {
          throw new Error('Invalid computer or action.');
        }
      
        if (action === 'Borrow' && student.privateKey !== privateKey) {
          throw new Error('Unauthorized transaction.');
        }
        const existingTransactionById = this.pendingTransactions.find(
            (transaction) => transaction.id === transactionData.id
          );
          
        const existingTransactionByDetails = this.pendingTransactions.find(
            (t) => t.studentId === studentId && t.computerId === computerId && t.action === action
          );

          
        if (existingTransactionById || existingTransactionByDetails) {
            throw new Error('Duplicate transaction.');
          }
        const transaction = new Transaction(studentId, computerId, action);
        //transaction.signTransaction(student.privateKey); // Sign the transaction using the student's private key
        this.pendingTransactions.push(transaction);
    
      
        return transaction;
      }

     
    
    

    getBlockByHash(blockHash) {
        for (const block of this.chain) {
            if (block.hash === blockHash) {
                return block;
            }
        }
        return null;
    }

    getTransactionById(transactionId) {
        for (const block of this.chain) {
            for (const transaction of block.transactions) {
                if (transaction.id === transactionId) {
                    return transaction;
                }
            }
        }
        return null;
    }
    addStudent(studentData) {
        if (!studentData.id || !studentData.name || !studentData.privateKey) {
            throw new Error('Invalid student data. All fields are required.');
        }

        if (this.students[studentData.id]) {
            throw new Error('Student with the same ID already exists.');
        }

    
        this.students[studentData.id] = {

            id: studentData.id,
            name: studentData.name,
            is_active: true, // You can set the default value
            privateKey: studentData.privateKey,
        };
        this.saveStudents(this.students);
    }
    

    // Add Computer Function
    addComputer(computerData) {
        if (!computerData.id || !computerData.name || !computerData.action) {
            throw new Error('Invalid computer data. All fields are required.');
        }

        if (this.computers[computerData.id]) {
            throw new Error('Computer with the same ID already exists.');
        }

        this.computers[computerData.id] = {
            id: computerData.id,
            name: computerData.name,
            action: computerData.action, // Set the initial state
        };
        this.saveComputers(this.computers);
    }
    loadStudents(filename) {
        try {
            const studentsData = fs.readFileSync(filename);
            return JSON.parse(studentsData);
        } catch (error) {
            return {}; // Return an empty object if the file doesn't exist or there's an error.
        }
    }



    saveStudents(studentsData) {
        const data = JSON.stringify(studentsData, null, 2);
        fs.writeFileSync('students.json', data);
    }

    loadComputers(filename) {
        try {
            console.log("started");
            const computersData = fs.readFileSync(filename,'utf-8');
            console.log("read");
            return JSON.parse(computersData);
        } catch (error) {
            console.log("empty ",error);
            return {}; // Return an empty object if the file doesn't exist or there's an error.
        }
    }

    saveComputers(computersData) {
        const data = JSON.stringify(computersData, null, 2);
        fs.writeFileSync('computers.json', data);
    }

    getAddressData(address) {
        const addressData = {
            address: address,
            balance: 0,
            transactions: []
        };

        for (const block of this.chain) {
            for (const transaction of block.transactions) {
                if (transaction.studentId === address) {
                    // This address is the sender
                    addressData.balance -= 1; // Adjust the balance based on your logic
                    addressData.transactions.push(transaction);
                }
                if (transaction.computerId === address) {
                    // This address is the recipient
                    addressData.balance += 1; // Adjust the balance based on your logic
                    addressData.transactions.push(transaction);
                }
            }
        }

        return addressData;
    }
   

    // Methods for managing computers and students can be added here.

    // ...
}

module.exports = Blockchain;
