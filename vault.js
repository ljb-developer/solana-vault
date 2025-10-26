// Global variables
let provider = null;
let program = null;
let wallet = null;
let vaultPda = null;
let initMembers = [];

// Program configuration
const PROGRAM_ID = new solanaWeb3.PublicKey("HGtcTd7zoVzQZHsXtGF8oTvA5Hry786cKBxDP9M32yft");
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
    ],
    "errors": [
        {
            "code": 6000,
            "name": "unauthorized",
            "msg": "You are not authorized to perform this action"
        }
    ]
};

// Connect to wallet
async function connectWallet() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom wallet not found!');
        }

        wallet = window.solana;
        
        // Connect to wallet
        await wallet.connect();
        addLog('Wallet connected: ' + wallet.publicKey.toString());
        
        // Setup provider and program
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
        provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        anchor.setProvider(provider);
        program = new anchor.Program(IDL, PROGRAM_ID, provider);
        
        // Update UI
        document.getElementById('walletInfo').innerHTML = `
            Connected: ${wallet.publicKey.toString()}<br>
            Network: Devnet
        `;
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        
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
    }
}

// Disconnect wallet
function disconnectWallet() {
    wallet.disconnect();
    document.getElementById('walletInfo').innerHTML = 'Not connected';
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('vaultInfo').style.display = 'none';
    
    // Disable buttons
    document.getElementById('infoBtn').disabled = true;
    document.getElementById('simulateBtn').disabled = true;
    document.getElementById('initBtn').disabled = true;
    document.getElementById('addMemberBtn').disabled = true;
    document.getElementById('removeMemberBtn').disabled = true;
    document.getElementById('withdrawBtn').disabled = true;
    
    addLog('Wallet disconnected');
}

// Find Vault PDA
async function findVaultPDA() {
    try {
        const [pda] = await solanaWeb3.PublicKey.findProgramAddress(
            [Buffer.from('vault'), wallet.publicKey.toBuffer()],
            PROGRAM_ID
        );
        vaultPda = pda;
        addLog('Vault PDA found: ' + vaultPda.toString());
    } catch (error) {
        addLog('Vault PDA not found for current wallet');
    }
}

// Get vault info
async function getVaultInfo() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        addLog('Fetching vault info...');
        
        // Fetch vault account
        const vaultAccount = await program.account.vault.fetch(vaultPda);
        
        const vaultInfoDiv = document.getElementById('vaultInfo');
        vaultInfoDiv.style.display = 'block';
        vaultInfoDiv.innerHTML = `
            <h3>Vault Details</h3>
            <strong>Owner:</strong> ${vaultAccount.owner.toString()}<br>
            <strong>Bump:</strong> ${vaultAccount.bump}<br>
            <strong>Members (${vaultAccount.members.length}):</strong><br>
            <ul>
                ${vaultAccount.members.map((member, index) => 
                    `<li>${index + 1}. ${member.toString()}</li>`
                ).join('')}
            </ul>
        `;
        
        addLog('Vault info fetched successfully');
        
    } catch (error) {
        showError('Failed to get vault info: ' + error.message);
    }
}

// Simulate get vault info
async function simulateGetVaultInfo() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        addLog('Simulating getVaultInfo...');
        
        const transaction = await program.methods.getVaultInfo()
            .accounts({ vault: vaultPda })
            .transaction();

        const simulation = await program.provider.connection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
            throw new Error('Simulation failed: ' + JSON.stringify(simulation.value.err));
        }

        // Display logs from simulation
        simulation.value.logs.forEach(log => {
            if (log.includes('Vault Owner:') || log.includes('Members count:') || log.includes('Member ')) {
                addLog(log);
            }
        });
        
    } catch (error) {
        showError('Simulation failed: ' + error.message);
    }
}

// Initialize vault
async function initializeVault() {
    try {
        if (!program || !wallet.publicKey) {
            throw new Error('Wallet not connected');
        }

        addLog('Initializing vault...');
        
        const tx = await program.methods.initializeVault(initMembers)
            .accounts({
                vault: vaultPda,
                payer: wallet.publicKey,
                systemProgram: solanaWeb3.SystemProgram.programId
            })
            .rpc();

        addLog('Vault initialized successfully! Transaction: ' + tx);
        showSuccess('Vault initialized!');
        
        // Clear init members
        initMembers = [];
        document.getElementById('initMembers').innerHTML = '';
        
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

// Add member to vault
async function addMember() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        const newMemberInput = document.getElementById('newMember');
        const newMemberPubkey = new solanaWeb3.PublicKey(newMemberInput.value.trim());
        
        addLog('Adding member: ' + newMemberPubkey.toString());
        
        const tx = await program.methods.addMember(newMemberPubkey)
            .accounts({
                vault: vaultPda,
                signer: wallet.publicKey
            })
            .rpc();

        addLog('Member added successfully! Transaction: ' + tx);
        showSuccess('Member added!');
        newMemberInput.value = '';
        
    } catch (error) {
        showError('Failed to add member: ' + error.message);
    }
}

// Remove member from vault
async function removeMember() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        const removeMemberInput = document.getElementById('removeMember');
        const memberPubkey = new solanaWeb3.PublicKey(removeMemberInput.value.trim());
        
        addLog('Removing member: ' + memberPubkey.toString());
        
        const tx = await program.methods.removeMember(memberPubkey)
            .accounts({
                vault: vaultPda,
                signer: wallet.publicKey
            })
            .rpc();

        addLog('Member removed successfully! Transaction: ' + tx);
        showSuccess('Member removed!');
        removeMemberInput.value = '';
        
    } catch (error) {
        showError('Failed to remove member: ' + error.message);
    }
}

// Withdraw SOL
async function withdrawSol() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        const recipientInput = document.getElementById('recipient');
        const amountInput = document.getElementById('amount');
        
        const recipient = new solanaWeb3.PublicKey(recipientInput.value.trim());
        const amount = new anchor.BN(amountInput.value);
        
        addLog(`Withdrawing ${amount} lamports to: ${recipient.toString()}`);
        
        const tx = await program.methods.withdrawSol(amount)
            .accounts({
                vault: vaultPda,
                recipient: recipient,
                signer: wallet.publicKey,
                systemProgram: solanaWeb3.SystemProgram.programId
            })
            .rpc();

        addLog('SOL withdrawn successfully! Transaction: ' + tx);
        showSuccess('SOL withdrawn!');
        
    } catch (error) {
        showError('Failed to withdraw SOL: ' + error.message);
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
    // You could also show a temporary error message in the UI
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

// Auto-connect if wallet was previously connected
window.addEventListener('load', async () => {
    if (window.solana && window.solana.isConnected) {
        await connectWallet();
    }
});