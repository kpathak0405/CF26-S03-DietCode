/**
 * Pralayaant Web3 Service — Blockchain Verification Layer
 * ─────────────────────────────────────────────────────────
 * Handles MetaMask detection, Sepolia network enforcement,
 * smart contract interaction, and transaction lifecycle management.
 *
 * Uses ethers.js v6 with window.ethereum (EIP-1193) injection.
 */
import { BrowserProvider, Contract, type TransactionReceipt } from "ethers";

// ─── Contract ABI (matches PralayaantAuditLog.sol) ───────────────────────────

const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "string", name: "_nodeId", type: "string" },
      { internalType: "string", name: "_assetId", type: "string" },
      { internalType: "string", name: "_sector", type: "string" },
      { internalType: "string", name: "_actionType", type: "string" },
      { internalType: "string", name: "_title", type: "string" },
      { internalType: "uint256", name: "_cost", type: "uint256" },
    ],
    name: "logIntervention",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_index", type: "uint256" }],
    name: "getRecord",
    outputs: [
      {
        components: [
          { internalType: "string", name: "nodeId", type: "string" },
          { internalType: "string", name: "assetId", type: "string" },
          { internalType: "string", name: "sector", type: "string" },
          { internalType: "string", name: "actionType", type: "string" },
          { internalType: "string", name: "title", type: "string" },
          { internalType: "uint256", name: "cost", type: "uint256" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
          { internalType: "address", name: "operator", type: "address" },
        ],
        internalType: "struct PralayaantAuditLog.InterventionRecord",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRecordCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "recordIndex", type: "uint256" },
      { indexed: true, internalType: "string", name: "nodeId", type: "string" },
      { indexed: false, internalType: "string", name: "actionType", type: "string" },
      { indexed: false, internalType: "uint256", name: "cost", type: "uint256" },
      { indexed: true, internalType: "address", name: "operator", type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "InterventionLogged",
    type: "event",
  },
];

// ─── Sepolia Network Constants ───────────────────────────────────────────────

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111
const SEPOLIA_NETWORK_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia Testnet",
  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.org"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

// ─── Transaction Status Type ─────────────────────────────────────────────────

export type TxStatus =
  | "idle"
  | "connecting"
  | "awaiting_signature"
  | "mining"
  | "confirmed"
  | "error";

export type TxResult = {
  status: TxStatus;
  txHash: string | null;
  error: string | null;
  receipt: TransactionReceipt | null;
};

// ─── Type Declaration for window.ethereum ────────────────────────────────────

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

// ─── Intervention Parameters ─────────────────────────────────────────────────

export interface InterventionParams {
  nodeId: string;
  assetId: string;
  sector: string;
  actionType: "SOLUTION" | "BLAST";
  title: string;
  cost: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Detect if MetaMask (or any EIP-1193 provider) is injected.
 */
export function detectMetaMask(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

/**
 * Request wallet connection via MetaMask.
 * Returns the connected account address.
 */
export async function connectWallet(): Promise<string> {
  if (!detectMetaMask()) {
    throw new Error("MetaMask not detected. Please install the MetaMask browser extension.");
  }

  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found. Please unlock MetaMask.");
  }

  return accounts[0];
}

/**
 * Ensure the connected wallet is on Sepolia Testnet.
 * If not, prompt the user to switch (or add the network).
 */
export async function ensureSepoliaNetwork(): Promise<void> {
  if (!detectMetaMask()) {
    throw new Error("MetaMask not detected.");
  }

  const chainId = (await window.ethereum!.request({
    method: "eth_chainId",
  })) as string;

  if (chainId === SEPOLIA_CHAIN_ID) return;

  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (switchError: unknown) {
    // Error code 4902 = chain not added to MetaMask
    if (
      typeof switchError === "object" &&
      switchError !== null &&
      "code" in switchError &&
      (switchError as { code: number }).code === 4902
    ) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [SEPOLIA_NETWORK_PARAMS],
      });
    } else {
      throw new Error("Failed to switch to Sepolia Testnet. Please switch manually in MetaMask.");
    }
  }
}

/**
 * Get an ethers.js Contract instance connected to the signer.
 */
export async function getContract(): Promise<Contract> {
  if (!detectMetaMask()) {
    throw new Error("MetaMask not detected.");
  }

  const envAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as string || "").trim();
  const contractAddress =
    envAddress && !envAddress.includes("YOUR_DEPLOYED_CONTRACT_ADDRESS")
      ? envAddress
      : "0x0aC33cf2D2fBE3B928f13D9fE8f8f915663956B2";

  if (!contractAddress || contractAddress.includes("YOUR_DEPLOYED_CONTRACT_ADDRESS")) {
    throw new Error(
      "Contract address not configured. Deploy the contract via Remix IDE and update VITE_CONTRACT_ADDRESS in .env"
    );
  }

  const provider = new BrowserProvider(window.ethereum!);
  const signer = await provider.getSigner();
  return new Contract(contractAddress, CONTRACT_ABI, signer);
}

/**
 * Log an infrastructure intervention on the blockchain.
 *
 * This is the main write function that triggers the MetaMask approval popup,
 * sends the transaction, and returns the full transaction lifecycle result.
 *
 * @param params - Intervention details to log on-chain
 * @param onStatusChange - Callback fired at each transaction lifecycle stage
 * @returns TxResult with the final status, txHash, and receipt
 */
export async function logInterventionOnChain(
  params: InterventionParams,
  onStatusChange?: (status: TxStatus) => void,
): Promise<TxResult> {
  const result: TxResult = {
    status: "idle",
    txHash: null,
    error: null,
    receipt: null,
  };

  try {
    // Step 1: Connect wallet
    onStatusChange?.("connecting");
    result.status = "connecting";
    await connectWallet();

    // Step 2: Ensure Sepolia network
    await ensureSepoliaNetwork();

    // Step 3: Get contract instance
    const contract = await getContract();

    // Step 4: Send transaction (MetaMask popup appears here)
    onStatusChange?.("awaiting_signature");
    result.status = "awaiting_signature";

    const tx = await contract.logIntervention(
      params.nodeId,
      params.assetId,
      params.sector,
      params.actionType,
      params.title,
      BigInt(params.cost),
    );

    result.txHash = tx.hash;

    // Step 5: Wait for mining confirmation
    onStatusChange?.("mining");
    result.status = "mining";

    const receipt = await tx.wait();
    result.receipt = receipt;

    // Step 6: Confirmed
    onStatusChange?.("confirmed");
    result.status = "confirmed";

    return result;
  } catch (err: unknown) {
    result.status = "error";

    if (typeof err === "object" && err !== null && "code" in err) {
      const errorCode = (err as { code: string | number }).code;

      if (errorCode === "ACTION_REJECTED" || errorCode === 4001) {
        result.error = "Transaction rejected by user.";
      } else {
        result.error = (err as { message?: string }).message || "Transaction failed.";
      }
    } else if (err instanceof Error) {
      result.error = err.message;
    } else {
      result.error = "An unknown error occurred.";
    }

    onStatusChange?.("error");
    return result;
  }
}

/**
 * Generate a direct Etherscan link for a transaction hash on Sepolia.
 */
export function getEtherscanLink(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}
