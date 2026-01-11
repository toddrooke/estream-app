/**
 * Wallet Service exports
 */

export {
  WalletService,
  getWalletService,
} from './WalletService';

export type {
  WalletAccount,
  SignResult,
  SendResult,
} from './WalletService';

export {
  WalletProvider,
  useWallet,
} from './WalletContext';
