// ===== Config =====
const PROGRAM_ID = new solanaWeb3.PublicKey("HGtcTd7zoVzQZHsXtGF8oTvA5Hry786cKBxDP9M32yft");

// UI helpers
const $ = (id) => document.getElementById(id);
const setStatus = (msg, cls = "muted") => {
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
  el.className = cls;
};

// Globals
let connection;
let wallet;               // Phantom provider (window.solana)
let walletPubkey = null;  // PublicKey
$("program-id-short").textContent = PROGRAM_ID.toBase58().slice(0,4)+"…"+PROGRAM_ID.toBase58().slice(-4);

// Warn on file://
if (location.protocol === "file:") {
  $("hint-file").style.display = "block";
}

// ===== Boot / Connect =====
function getConnection() {
  const url = $("cluster").value;
  return new solanaWeb3.Connection(url, { commitment: "confirmed" });
}

async function connectWallet() {
  if (!window.solana || !window.solana.isPhantom) {
    throw new Error("Phantom wallet not found. Install it and refresh.");
  }
  wallet = window.solana;
  await wallet.connect();
  walletPubkey = wallet.publicKey;
  $("wallet").textContent = walletPubkey.toBase58();
  connection = getConnection();
  setStatus("Wallet connected", "ok");
  await computeAndShowVaultPDA();
}

$("connect").addEventListener("click", async () => {
  try {
    await connectWallet();
  } catch (e) {
    console.error(e);
    alert(e.message || String(e));
    setStatus(e.message || String(e), "err");
  }
});

$("cluster").addEventListener("change", async () => {
  connection = getConnection();
  if (walletPubkey) await refreshVault();
});

// ===== PDA =====
function deriveVaultPDA(ownerPk) {
  const encoder = new TextEncoder();
  const seed1 = encoder.encode("vault");
  const seed2 = ownerPk.toBytes();
  return solanaWeb3.PublicKey.findProgramAddressSync([seed1, seed2], PROGRAM_ID)[0];
}

async function computeAndShowVaultPDA() {
  if (!walletPubkey) return;
  const pda = deriveVaultPDA(walletPubkey);
  $("vault-pda").textContent = pda.toBase58();
  return pda;
}

// ===== Encoding helpers (Anchor wire format, but no Anchor JS) =====
async function anchorDiscriminator(name /* e.g. "initialize_vault" */) {
  const enc = new TextEncoder();
  const preimage = enc.encode(`global:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", preimage);
  return new Uint8Array(hash).slice(0, 8);
}
function u32le(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function u64le(nBig) {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setBigUint64(0, BigInt(nBig), true);
  return b;
}
function concat(...chunks) {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
function pubkeyBytes(pk) {
  return new Uint8Array(pk.toBytes());
}

// ===== Instruction builders =====
async function ix_initialize_vault(vaultPda, payer, initialMembers) {
  // data = disc[8] + vec<Pubkey>
  const disc = await anchorDiscriminator("initialize_vault");
  const membersBytes = concat(
    u32le(initialMembers.length),
    ...initialMembers.map(pubkeyBytes)
  );
  const data = concat(disc, membersBytes);

  const keys = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: payer,    isSigner: true,  isWritable: true },
    { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new solanaWeb3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

async function ix_add_member(vaultPda, signer, newMember) {
  const disc = await anchorDiscriminator("add_member");
  const data = concat(disc, pubkeyBytes(newMember));
  const keys = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: signer,   isSigner: true,  isWritable: false },
  ];
  return new solanaWeb3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

async function ix_remove_member(vaultPda, signer, member) {
  const disc = await anchorDiscriminator("remove_member");
  const data = concat(disc, pubkeyBytes(member));
  const keys = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: signer,   isSigner: true,  isWritable: false },
  ];
  return new solanaWeb3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

async function ix_withdraw_sol(vaultPda, signer, recipient, amountLamports) {
  const disc = await anchorDiscriminator("withdraw_sol");
  const data = concat(disc, u64le(BigInt(amountLamports)));
  const keys = [
    { pubkey: vaultPda,   isSigner: false, isWritable: true },
    { pubkey: recipient,  isSigner: false, isWritable: true },
    { pubkey: signer,     isSigner: true,  isWritable: false },
    { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new solanaWeb3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

async function ix_get_vault_info(vaultPda) {
  const disc = await anchorDiscriminator("get_vault_info");
  const data = new Uint8Array(disc); // no args
  const keys = [{ pubkey: vaultPda, isSigner: false, isWritable: false }];
  return new solanaWeb3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

// ===== Tx helper (Phantom) =====
async function sendInstructions(ixs) {
  if (!wallet || !walletPubkey) throw new Error("Connect wallet first.");
  const tx = new solanaWeb3.Transaction().add(...ixs);
  tx.feePayer = walletPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;

  // Prefer signAndSendTransaction if present (Phantom 1.0+)
  if (wallet.signAndSendTransaction) {
    const { signature } = await wallet.signAndSendTransaction(tx);
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  } else {
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

// ===== UI actions =====
function parseMembersCSV(text) {
  return (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new solanaWeb3.PublicKey(s));
}

$("btn-init").addEventListener("click", async () => {
  try {
    if (!walletPubkey) await connectWallet();
    setStatus("Initializing vault…");
    const members = parseMembersCSV($("init-members").value);
    const vaultPda = deriveVaultPDA(walletPubkey);
    const ix = await ix_initialize_vault(vaultPda, walletPubkey, members);
    const sig = await sendInstructions([ix]);
    $("init-msg").innerHTML = `✅ Initialized<br>Tx: <code class="mono">${sig}</code>`;
    await computeAndShowVaultPDA();
    await refreshVault();
    setStatus("Vault initialized ✅", "ok");
  } catch (e) {
    console.error(e);
    $("init-msg").innerHTML = `<span class="err">${e.message || e}</span>`;
    setStatus("Init failed", "err");
  }
});

$("btn-add").addEventListener("click", async () => {
  try {
    if (!walletPubkey) await connectWallet();
    setStatus("Adding member…");
    const vaultPda = deriveVaultPDA(walletPubkey);
    const newMember = new solanaWeb3.PublicKey($("add-member").value.trim());
    const ix = await ix_add_member(vaultPda, walletPubkey, newMember);
    const sig = await sendInstructions([ix]);
    $("add-msg").innerHTML = `✅ Member added. Tx: <code class="mono">${sig}</code>`;
    await refreshVault();
    setStatus("Member added ✅", "ok");
  } catch (e) {
    console.error(e);
    $("add-msg").innerHTML = `<span class="err">${e.message || e}</span>`;
    setStatus("Add failed", "err");
  }
});

$("btn-remove").addEventListener("click", async () => {
  try {
    if (!walletPubkey) await connectWallet();
    setStatus("Removing member…");
    const vaultPda = deriveVaultPDA(walletPubkey);
    const member = new solanaWeb3.PublicKey($("remove-member").value.trim());
    const ix = await ix_remove_member(vaultPda, walletPubkey, member);
    const sig = await sendInstructions([ix]);
    $("remove-msg").innerHTML = `✅ Member removed. Tx: <code class="mono">${sig}</code>`;
    await refreshVault();
    setStatus("Member removed ✅", "ok");
  } catch (e) {
    console.error(e);
    $("remove-msg").innerHTML = `<span class="err">${e.message || e}</span>`;
    setStatus("Remove failed", "err");
  }
});

$("btn-withdraw").addEventListener("click", async () => {
  try {
    if (!walletPubkey) await connectWallet();
    setStatus("Withdrawing…");
    const vaultPda = deriveVaultPDA(walletPubkey);
    const recipient = new solanaWeb3.PublicKey($("withdraw-recipient").value.trim());
    const amount = BigInt($("withdraw-amount").value || "0");
    const ix = await ix_withdraw_sol(vaultPda, walletPubkey, recipient, amount);
    const sig = await sendInstructions([ix]);
    $("withdraw-msg").innerHTML = `✅ Withdrawn. Tx: <code class="mono">${sig}</code>`;
    setStatus("Withdraw sent ✅", "ok");
  } catch (e) {
    console.error(e);
    $("withdraw-msg").innerHTML = `<span class="err">${e.message || e}</span>`;
    setStatus("Withdraw failed", "err");
  }
});

$("btn-refresh").addEventListener("click", async () => {
  await refreshVault();
});

// ===== Read account (no Anchor needed) =====
async function refreshVault() {
  try {
    if (!walletPubkey) {
      $("owner").textContent = "—";
      $("bump").textContent = "—";
      $("members").innerHTML = "";
      $("members-count").textContent = "0";
      return;
    }
    const pda = deriveVaultPDA(walletPubkey);
    $("vault-pda").textContent = pda.toBase58();

    const info = await connection.getAccountInfo(pda);
    if (!info) {
      $("owner").textContent = "Not initialized";
      $("bump").textContent = "—";
      $("members").innerHTML = "";
      $("members-count").textContent = "0";
      setStatus("No vault found for this owner (initialize first).");
      return;
    }
    const data = info.data; // Buffer / Uint8Array

    // Anchor account layout: 8-byte acc discriminator, then fields
    let o = 8;
    const owner = new solanaWeb3.PublicKey(data.slice(o, o + 32)); o += 32;

    // Vec<Pubkey> = u32 le length, then each 32 bytes
    const len = new DataView(data.buffer, data.byteOffset + o, 4).getUint32(0, true);
    o += 4;
    const members = [];
    for (let i = 0; i < len; i++) {
      members.push(new solanaWeb3.PublicKey(data.slice(o, o + 32)));
      o += 32;
    }

    const bump = data[o]; // u8

    $("owner").textContent = owner.toBase58();
    $("bump").textContent = String(bump);
    $("members").innerHTML = "";
    members.forEach((pk) => {
      const li = document.createElement("li");
      li.textContent = pk.toBase58();
      $("members").appendChild(li);
    });
    $("members-count").textContent = String(members.length);
    setStatus("Vault loaded ✅", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Read failed: " + (e.message || e), "err");
  }
}

// Auto-connect if trusted
window.addEventListener("load", async () => {
  try {
    if (window.solana && window.solana.isPhantom) {
      await window.solana.connect({ onlyIfTrusted: true });
      if (window.solana.publicKey) {
        await connectWallet();
        await refreshVault();
      }
    }
  } catch {}
});
