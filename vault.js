// Global variables
let provider = null;
let program = null;
let wallet = null;
let vaultPda = null;
let initMembers = [];

// Program configuration
const PROGRAM_ID = new solanaWeb3.PublicKey("HGtcTd7zoVzQZHsXtGF8oTvA5Hry786cKBxDP9M32yft");

// Simple IDL - minimal version
const IDL = {
    "version": "0.1.0",
    "name": "solana_vault",
    "instructions": [
        {
            "name": "initializeVault",
            "accounts": [
                { "name": "vault", "isMut": true, "isSigner": false },
                { "name": "payer", "isMut": true, "isSigner": true },
                { "name": "systemProgram", "isMut": false, "isSigner": false }
            ],
            "args": [
                { "name": "initialMembers", "type": { "vec": "publicKey" } }
            ]
        },
        {
            "name": "addMember",
            "accounts": [
                { "name": "vault", "isMut": true, "isSigner": false },
                { "name": "signer", "isMut": false, "isSigner": true }
            ],
            "args": [
                { "name": "newMember", "type": "publicKey" }
            ]
        },
        {
            "name": "removeMember",
            "accounts": [
                { "name": "vault", "isMut": true, "isSigner": false },
                { "name": "signer", "isMut": false, "isSigner": true }
            ],
            "args": [
                { "name": "member", "type": "publicKey" }
            ]
        },
        {
            "name": "withdrawSol",
            "accounts": [
                { "name": "vault", "isMut": true, "isSigner": false },
                { "name": "recipient", "isMut": true, "isSigner": false },
                { "name": "signer", "isMut": false, "isSigner": true },
                { "name": "systemProgram", "isMut": false, "isSigner": false }
            ],
            "args": [
                { "name": "amount", "type": "u64" }
            ]
        },
        {
            "name": "getVaultInfo",
            "accounts": [
                { "name": "vault", "isMut": false, "isSigner": false }
            ],
            "args": []
        }
    ],
    "accounts": [
        {
            "name": "vault",
            "type": {
                "kind": "struct",
                "fields": [
                    { "name": "owner", "type": "publicKey" },
                    { "name": "members", "type": { "vec": "publicKey" } },
                    { "name": "bump", "type": "u8" }
                ]
            }
        }
    ]
};

// Connect to wallet - SIMPLIFIED VERSION
async function connectWallet() {
    try {
        // Check if Phantom is installed
        if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom wallet not found! Please install Phantom wallet.');
        }

        wallet = window.solana;
        
        // Connect to wallet
        await wallet.connect();
        addLog('Wallet connected: ' + wallet.publicKey.toString());
        
        // Setup connection
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
        
        // Check if Anchor is available
        if (typeof anchor === 'undefined') {
            throw new Error('Anchor library not loaded. Please refresh the page.');
        }
        
        // Create provider
        provider = new anchor.AnchorProvider(connection, wallet, { 
            commitment: 'confirmed',
            preflightCommitment: 'confirmed'
        });
        
        // Set provider
        anchor.setProvider(provider);
        
        // Create program
        program = new anchor.Program(IDL, PROGRAM_ID, provider);
        
        // Update UI
        document.getElementById('walletInfo').innerHTML = `
            Connected: ${wallet.publicKey.toString()}<br>
            Network: Devnet<br>
            Balance: Loading...
        `;
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        
        // Get balance
        const balance = await connection.getBalance(wallet.publicKey);
        document.getElementById('walletInfo').innerHTML = `
            Connected: ${wallet.publicKey.toString()}<br>
            Network: Devnet<br>
            Balance: ${balance / solanaWeb3.LAMPORTS_PER_SOL} SOL
        `;
        
        // Enable buttons
        document.getElementById('infoBtn').disabled = false;
        document.getElementById('simulateBtn').disabled = false;
        document.getElementById('initBtn').disabled = false;
        document.getElementById('addMemberBtn').disabled = false;
        document.getElementById('removeMemberBtn').disabled = false;
        document.getElementById('withdrawBtn').disabled = false;
        
        // Find vault PDA
        await findVaultPDA();
        
    } catch (error) {
        showError('Failed to connect wallet: ' + error.message);
        console.error('Connection error:', error);
    }
}

// Disconnect wallet
function disconnectWallet() {
    if (wallet && wallet.disconnect) {
        wallet.disconnect();
    }
    document.getElementById('walletInfo').innerHTML = 'Not connected';
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('vaultInfo').style.display = 'none';
    document.getElementById('vaultAddress').textContent = 'Not connected';
    
    // Disable buttons
    const buttons = ['infoBtn', 'simulateBtn', 'initBtn', 'addMemberBtn', 'removeMemberBtn', 'withdrawBtn'];
    buttons.forEach(btnId => {
        document.getElementById(btnId).disabled = true;
    });
    
    addLog('Wallet disconnected');
    
    // Reset state
    provider = null;
    program = null;
    wallet = null;
    vaultPda = null;
}

// Find Vault PDA
async function findVaultPDA() {
    try {
        const [pda] = solanaWeb3.PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), wallet.publicKey.toBuffer()],
            PROGRAM_ID
        );
        vaultPda = pda;
        addLog('Vault PDA: ' + vaultPda.toString());
        document.getElementById('vaultAddress').textContent = vaultPda.toString();
        
        // Check if vault exists
        const vaultInfo = await program.provider.connection.getAccountInfo(vaultPda);
        if (vaultInfo) {
            addLog('✓ Vault exists on-chain');
            document.getElementById('initBtn').disabled = true;
        } else {
            addLog('✗ Vault not found - click Initialize to create it');
            document.getElementById('initBtn').disabled = false;
        }
        
    } catch (error) {
        addLog('Error finding vault: ' + error.message);
    }
}

// Get vault info
async function getVaultInfo() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        addLog('Fetching vault info from: ' + vaultPda.toString());
        
        // Check if vault exists first
        const vaultAccountInfo = await program.provider.connection.getAccountInfo(vaultPda);
        if (!vaultAccountInfo) {
            throw new Error('Vault not initialized. Please initialize first.');
        }
        
        // Fetch vault account
        const vaultAccount = await program.account.vault.fetch(vaultPda);
        
        const vaultInfoDiv = document.getElementById('vaultInfo');
        vaultInfoDiv.style.display = 'block';
        vaultInfoDiv.innerHTML = `
            <h3>Vault Details</h3>
            <strong>Vault Address:</strong> ${vaultPda.toString()}<br>
            <strong>Owner:</strong> ${vaultAccount.owner.toString()}<br>
            <strong>Bump:</strong> ${vaultAccount.bump}<br>
            <strong>Balance:</strong> ${vaultAccountInfo.lamports / solanaWeb3.LAMPORTS_PER_SOL} SOL<br>
            <strong>Members (${vaultAccount.members.length}):</strong><br>
            <ul>
                ${vaultAccount.members.map((member, index) => 
                    `<li>${index + 1}. ${member.toString()}</li>`
                ).join('')}
            </ul>
            <strong>Your Permissions:</strong><br>
            - Owner: ${vaultAccount.owner.toString() === wallet.publicKey.toString() ? '✓ YES' : '✗ NO'}<br>
            - Member: ${vaultAccount.members.some(m => m.toString() === wallet.publicKey.toString()) ? '✓ YES' : '✗ NO'}<br>
            - Can Withdraw: ${(vaultAccount.owner.toString() === wallet.publicKey.toString() || 
                              vaultAccount.members.some(m => m.toString() === wallet.publicKey.toString())) ? '✓ YES' : '✗ NO'}
        `;
        
        addLog('Vault info fetched successfully');
        
    } catch (error) {
        showError('Failed to get vault info: ' + error.message);
    }
}

// Initialize vault
async function initializeVault() {
    try {
        if (!program || !wallet.publicKey) {
            throw new Error('Wallet not connected');
        }

        addLog('Initializing vault at: ' + vaultPda.toString());
        
        const tx = await program.methods.initializeVault(initMembers)
            .accounts({
                vault: vaultPda,
                payer: wallet.publicKey,
                systemProgram: solanaWeb3.SystemProgram.programId
            })
            .rpc();

        addLog('✓ Vault initialized successfully!');
        addLog('Transaction: ' + tx);
        showSuccess('Vault initialized at: ' + vaultPda.toString());
        
        // Clear init members and disable init button
        initMembers = [];
        document.getElementById('initMembers').innerHTML = '';
        document.getElementById('initBtn').disabled = true;
        
    } catch (error) {
        showError('Failed to initialize vault: ' + error.message);
    }
}

// Add member to initialization list
function addMemberToInit() {
    const memberInput = document.getElementById('memberInput');
    const memberPubkey = memberInput.value.trim();
    
    if (!memberPubkey) {
        showError('Please enter a valid public key');
        return;
    }
    
    try {
        const pubkey = new solanaWeb3.PublicKey(memberPubkey);
        initMembers.push(pubkey);
        
        const initMembersDiv = document.getElementById('initMembers');
        initMembersDiv.innerHTML += `<div>Member: ${memberPubkey}</div>`;
        
        memberInput.value = '';
        addLog('Member added to initialization list: ' + memberPubkey);
        
    } catch (error) {
        showError('Invalid public key: ' + error.message);
    }
}

// Utility functions
function addLog(message) {
    const logsDiv = document.getElementById('logs');
    const timestamp = new Date().toLocaleTimeString();
    logsDiv.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

function clearLogs() {
    document.getElementById('logs').innerHTML = '';
}

function showError(message) {
    addLog('ERROR: ' + message);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    document.body.prepend(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
}

// Check if libraries are loaded
window.addEventListener('load', function() {
    addLog('Page loaded - checking dependencies...');
    
    if (typeof solanaWeb3 === 'undefined') {
        showError('Solana Web3.js not loaded!');
        return;
    }
    
    if (typeof anchor === 'undefined') {
        showError('Anchor library not loaded!');
        return;
    }
    
    addLog('✓ All libraries loaded successfully');
    
    // Auto-connect if wallet was previously connected
    if (window.solana && window.solana.isConnected) {
        addLog('Auto-connecting to wallet...');
        connectWallet();
    }
});

// For now, comment out the functions that might cause issues
// We'll implement them step by step once basic connection works

/*
// These functions will be implemented after basic connection is working
async function addMember() {
    addLog('Add member function not yet implemented');
}

async function removeMember() {
    addLog('Remove member function not yet implemented');
}

async function withdrawSol() {
    addLog('Withdraw SOL function not yet implemented');
}

async function simulateGetVaultInfo() {
    addLog('Simulate get vault info function not yet implemented');
}
*/