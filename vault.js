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
        
        // Setup provider and program - FIXED: Use window.anchor
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
        provider = new window.anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        window.anchor.setProvider(provider);
        program = new window.anchor.Program(IDL, PROGRAM_ID, provider);
        
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
    if (wallet && wallet.disconnect) {
        wallet.disconnect();
    }
    document.getElementById('walletInfo').innerHTML = 'Not connected';
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('vaultInfo').style.display = 'none';
    document.getElementById('vaultAddress').textContent = 'Not connected';
    
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
        const [pda] = await solanaWeb3.PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), wallet.publicKey.toBuffer()],
            PROGRAM_ID
        );
        vaultPda = pda;
        addLog('Vault PDA found: ' + vaultPda.toString());
        document.getElementById('vaultAddress').textContent = vaultPda.toString();
        
        // Check if vault exists
        try {
            const vaultInfo = await program.provider.connection.getAccountInfo(vaultPda);
            if (vaultInfo) {
                addLog('✓ Vault exists on-chain');
                document.getElementById('initBtn').disabled = true;
            } else {
                addLog('✗ Vault not found - initialize to create it');
                document.getElementById('initBtn').disabled = false;
            }
        } catch (error) {
            addLog('Could not check vault existence: ' + error.message);
        }
        
    } catch (error) {
        addLog('Vault PDA not found for current wallet: ' + error.message);
    }
}

// Get vault info
async function getVaultInfo() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        addLog('Fetching vault info from: ' + vaultPda.toString());
        
        // Fetch vault account
        const vaultAccount = await program.account.vault.fetch(vaultPda);
        
        const vaultInfoDiv = document.getElementById('vaultInfo');
        vaultInfoDiv.style.display = 'block';
        vaultInfoDiv.innerHTML = `
            <h3>Vault Details</h3>
            <strong>Vault Address:</strong> ${vaultPda.toString()}<br>
            <strong>Owner:</strong> ${vaultAccount.owner.toString()}<br>
            <strong>Bump:</strong> ${vaultAccount.bump}<br>
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
        if (simulation.value.logs) {
            simulation.value.logs.forEach(log => {
                if (log.includes('Vault Owner:') || log.includes('Members count:') || log.includes('Member ')) {
                    addLog(log);
                }
            });
        }
        
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

        addLog('Initializing vault at: ' + vaultPda.toString());
        addLog('Initial members: ' + initMembers.map(m => m.toString()).join(', '));
        
        const tx = await program.methods.initializeVault(initMembers)
            .accounts({
                vault: vaultPda,
                payer: wallet.publicKey,
                systemProgram: solanaWeb3.SystemProgram.programId
            })
            .rpc();

        addLog('✓ Vault initialized successfully!');
        addLog('Transaction: ' + tx);
        showSuccess('Vault initialized!');
        
        // Clear init members
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

// Add member to vault
async function addMember() {
    try {
        if (!program || !vaultPda) {
            throw new Error('Wallet not connected or vault not found');
        }

        const newMemberInput = document.getElementById('newMember');
        const newMemberPubkey = newMemberInput.value.trim();
        
        if (!newMemberPubkey) {
            showError('Please enter a member public key');
            return;
        }
        
        const pubkey = new solanaWeb3.PublicKey(newMemberPubkey);
        addLog('Adding member: ' + pubkey.toString());
        
        const tx = await program.methods.addMember(pubkey)
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
        const memberPubkey = removeMemberInput.value.trim();
        
        if (!memberPubkey) {
            showError('Please enter a member public key to remove');
            return;
        }
        
        const pubkey = new solanaWeb3.PublicKey(memberPubkey);
        addLog('Removing member: ' + pubkey.toString());
        
        const tx = await program.methods.removeMember(pubkey)
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
        
        const recipient = recipientInput.value.trim();
        const amount = amountInput.value;
        
        if (!recipient) {
            showError('Please enter a recipient address');
            return;
        }
        
        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        
        const recipientPubkey = new solanaWeb3.PublicKey(recipient);
        // FIXED: Use window.anchor.BN
        const amountBN = new window.anchor.BN(amount);
        
        addLog(`Withdrawing ${amount} lamports to: ${recipientPubkey.toString()}`);
        
        const tx = await program.methods.withdrawSol(amountBN)
            .accounts({
                vault: vaultPda,
                recipient: recipientPubkey,
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