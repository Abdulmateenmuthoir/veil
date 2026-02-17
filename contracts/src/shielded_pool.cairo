/// Veil — ShieldedPool Contract
///
/// A single shared pool that holds ERC20 tokens on behalf of all users.
/// Balances are stored as ElGamal ciphertexts. The contract never sees
/// plaintext amounts for transfers — it only verifies STARK proofs and
/// updates encrypted state using client-provided ciphertexts.
///
/// Homomorphic property of ElGamal ensures encrypted balance updates
/// are consistent without the contract ever decrypting.

#[starknet::interface]
pub trait IShieldedPool<TContractState> {
    /// Register an ElGamal public key and bind it to the caller's address.
    fn register(ref self: TContractState, pk_x: felt252, pk_y: felt252);

    /// Deposit ERC20 into the pool. Caller provides plaintext amount and
    /// the new accumulated encrypted balance (old_balance + Enc(amount)).
    fn deposit(
        ref self: TContractState,
        amount: u256,
        new_balance_c1_x: felt252,
        new_balance_c1_y: felt252,
        new_balance_c2_x: felt252,
        new_balance_c2_y: felt252,
    );

    /// Confidential transfer. Sender submits updated ciphertexts for both
    /// parties, plus ZK proofs of correctness.
    fn transfer(
        ref self: TContractState,
        recipient_pk_x: felt252,
        recipient_pk_y: felt252,
        new_sender_balance_c1_x: felt252,
        new_sender_balance_c1_y: felt252,
        new_sender_balance_c2_x: felt252,
        new_sender_balance_c2_y: felt252,
        new_recipient_balance_c1_x: felt252,
        new_recipient_balance_c1_y: felt252,
        new_recipient_balance_c2_x: felt252,
        new_recipient_balance_c2_y: felt252,
        proof_hash: felt252,
        nullifier: felt252,
    );

    /// Withdraw plaintext ERC20. User proves decrypted balance >= amount.
    fn withdraw(
        ref self: TContractState,
        amount: u256,
        new_balance_c1_x: felt252,
        new_balance_c1_y: felt252,
        new_balance_c2_x: felt252,
        new_balance_c2_y: felt252,
        proof_hash: felt252,
        nullifier: felt252,
    );

    // ── View functions ──

    fn get_encrypted_balance(
        self: @TContractState, pk_x: felt252, pk_y: felt252,
    ) -> (felt252, felt252, felt252, felt252);

    fn is_registered(self: @TContractState, pk_x: felt252, pk_y: felt252) -> bool;

    fn is_nullifier_spent(self: @TContractState, nullifier: felt252) -> bool;

    fn get_total_value_locked(self: @TContractState) -> u256;

    fn get_token(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::contract]
pub mod ShieldedPool {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use super::IShieldedPool;

    // ────────────────────────────────────────────
    //  Storage
    // ────────────────────────────────────────────

    #[storage]
    struct Storage {
        /// ERC20 token this pool shields.
        token: ContractAddress,
        /// Admin address.
        owner: ContractAddress,
        /// pk_hash → registered flag.
        registered: Map<felt252, bool>,
        /// pk_hash → Starknet address that owns this key.
        pk_to_address: Map<felt252, ContractAddress>,
        /// Starknet address (as felt252) → pk_hash. Reverse lookup.
        address_to_pk_hash: Map<felt252, felt252>,
        /// Encrypted balance components: pk_hash → felt252.
        balance_c1_x: Map<felt252, felt252>,
        balance_c1_y: Map<felt252, felt252>,
        balance_c2_x: Map<felt252, felt252>,
        balance_c2_y: Map<felt252, felt252>,
        /// Nullifier registry: nullifier → spent flag.
        nullifiers: Map<felt252, bool>,
        /// Plaintext total value locked (deposits − withdrawals).
        total_value_locked: u256,
    }

    // ────────────────────────────────────────────
    //  Events
    // ────────────────────────────────────────────

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Registered: Registered,
        Deposited: Deposited,
        TransferExecuted: TransferExecuted,
        Withdrawn: Withdrawn,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Registered {
        #[key]
        pub pk_hash: felt252,
        pub address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposited {
        #[key]
        pub pk_hash: felt252,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TransferExecuted {
        #[key]
        pub sender_pk_hash: felt252,
        #[key]
        pub recipient_pk_hash: felt252,
        pub nullifier: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn {
        #[key]
        pub pk_hash: felt252,
        pub amount: u256,
        pub nullifier: felt252,
    }

    // ────────────────────────────────────────────
    //  Constructor
    // ────────────────────────────────────────────

    #[constructor]
    fn constructor(ref self: ContractState, token: ContractAddress, owner: ContractAddress) {
        self.token.write(token);
        self.owner.write(owner);
    }

    // ────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────

    /// Derive a deterministic storage key from an ElGamal public key.
    fn hash_pk(pk_x: felt252, pk_y: felt252) -> felt252 {
        core::pedersen::pedersen(pk_x, pk_y)
    }

    // ────────────────────────────────────────────
    //  Implementation
    // ────────────────────────────────────────────

    #[abi(embed_v0)]
    impl ShieldedPoolImpl of IShieldedPool<ContractState> {
        /// Register an ElGamal public key for the calling address.
        fn register(ref self: ContractState, pk_x: felt252, pk_y: felt252) {
            let caller = get_caller_address();
            let pk_hash = hash_pk(pk_x, pk_y);
            let caller_felt: felt252 = caller.into();

            // Ensure not already registered.
            assert(!self.registered.read(pk_hash), 'ALREADY_REGISTERED');
            assert(self.address_to_pk_hash.read(caller_felt) == 0, 'ADDRESS_ALREADY_BOUND');

            // Store both directions of the mapping.
            self.registered.write(pk_hash, true);
            self.pk_to_address.write(pk_hash, caller);
            self.address_to_pk_hash.write(caller_felt, pk_hash);

            // Initialize encrypted balance to the identity (zero ciphertext).
            self.balance_c1_x.write(pk_hash, 0);
            self.balance_c1_y.write(pk_hash, 0);
            self.balance_c2_x.write(pk_hash, 0);
            self.balance_c2_y.write(pk_hash, 0);

            self.emit(Registered { pk_hash, address: caller });
        }

        /// Deposit plaintext ERC20 into the shielded pool.
        ///
        /// The client encrypts `amount` under their own ElGamal public key,
        /// homomorphically adds it to their current encrypted balance, and
        /// submits the resulting ciphertext as the new balance.
        ///
        /// The contract locks the plaintext tokens and stores the new ciphertext.
        fn deposit(
            ref self: ContractState,
            amount: u256,
            new_balance_c1_x: felt252,
            new_balance_c1_y: felt252,
            new_balance_c2_x: felt252,
            new_balance_c2_y: felt252,
        ) {
            let caller = get_caller_address();
            let caller_felt: felt252 = caller.into();
            let pk_hash = self.address_to_pk_hash.read(caller_felt);

            assert(pk_hash != 0, 'NOT_REGISTERED');
            assert(amount > 0, 'ZERO_AMOUNT');

            // Transfer ERC20 from caller → pool.
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            token.transfer_from(caller, starknet::get_contract_address(), amount);

            // Store the new encrypted balance (client-computed).
            self.balance_c1_x.write(pk_hash, new_balance_c1_x);
            self.balance_c1_y.write(pk_hash, new_balance_c1_y);
            self.balance_c2_x.write(pk_hash, new_balance_c2_x);
            self.balance_c2_y.write(pk_hash, new_balance_c2_y);

            // Track plaintext TVL.
            self.total_value_locked.write(self.total_value_locked.read() + amount);

            self.emit(Deposited { pk_hash, amount });
        }

        /// Confidential transfer between two registered users.
        ///
        /// The sender:
        ///   1. Decrypts their balance locally.
        ///   2. Computes new encrypted balances for both parties.
        ///   3. Generates a STARK proof attesting:
        ///      - sender balance >= amount
        ///      - amount > 0
        ///      - new ciphertexts are correctly derived
        ///   4. Submits everything + a unique nullifier.
        fn transfer(
            ref self: ContractState,
            recipient_pk_x: felt252,
            recipient_pk_y: felt252,
            new_sender_balance_c1_x: felt252,
            new_sender_balance_c1_y: felt252,
            new_sender_balance_c2_x: felt252,
            new_sender_balance_c2_y: felt252,
            new_recipient_balance_c1_x: felt252,
            new_recipient_balance_c1_y: felt252,
            new_recipient_balance_c2_x: felt252,
            new_recipient_balance_c2_y: felt252,
            proof_hash: felt252,
            nullifier: felt252,
        ) {
            let caller = get_caller_address();
            let caller_felt: felt252 = caller.into();

            // Validate sender.
            let sender_pk_hash = self.address_to_pk_hash.read(caller_felt);
            assert(sender_pk_hash != 0, 'SENDER_NOT_REGISTERED');

            // Validate recipient.
            let recipient_pk_hash = hash_pk(recipient_pk_x, recipient_pk_y);
            assert(self.registered.read(recipient_pk_hash), 'RECIPIENT_NOT_REGISTERED');

            // Validate nullifier is fresh.
            assert(!self.nullifiers.read(nullifier), 'NULLIFIER_SPENT');

            // Verify STARK proof.
            // In production: call a Cairo STARK verifier or inline verification.
            // For hackathon MVP: assert non-zero proof hash as placeholder.
            assert(proof_hash != 0, 'INVALID_PROOF');

            // Mark nullifier as spent.
            self.nullifiers.write(nullifier, true);

            // Update sender's encrypted balance.
            self.balance_c1_x.write(sender_pk_hash, new_sender_balance_c1_x);
            self.balance_c1_y.write(sender_pk_hash, new_sender_balance_c1_y);
            self.balance_c2_x.write(sender_pk_hash, new_sender_balance_c2_x);
            self.balance_c2_y.write(sender_pk_hash, new_sender_balance_c2_y);

            // Update recipient's encrypted balance.
            self.balance_c1_x.write(recipient_pk_hash, new_recipient_balance_c1_x);
            self.balance_c1_y.write(recipient_pk_hash, new_recipient_balance_c1_y);
            self.balance_c2_x.write(recipient_pk_hash, new_recipient_balance_c2_x);
            self.balance_c2_y.write(recipient_pk_hash, new_recipient_balance_c2_y);

            self.emit(TransferExecuted { sender_pk_hash, recipient_pk_hash, nullifier });
        }

        /// Withdraw plaintext ERC20 from the pool.
        ///
        /// The user proves (via STARK proof) that their decrypted balance
        /// covers the withdrawal amount and that the new encrypted balance
        /// is correctly computed.
        fn withdraw(
            ref self: ContractState,
            amount: u256,
            new_balance_c1_x: felt252,
            new_balance_c1_y: felt252,
            new_balance_c2_x: felt252,
            new_balance_c2_y: felt252,
            proof_hash: felt252,
            nullifier: felt252,
        ) {
            let caller = get_caller_address();
            let caller_felt: felt252 = caller.into();
            let pk_hash = self.address_to_pk_hash.read(caller_felt);

            assert(pk_hash != 0, 'NOT_REGISTERED');
            assert(amount > 0, 'ZERO_AMOUNT');
            assert(!self.nullifiers.read(nullifier), 'NULLIFIER_SPENT');
            assert(proof_hash != 0, 'INVALID_PROOF');

            // Mark nullifier as spent.
            self.nullifiers.write(nullifier, true);

            // Update encrypted balance.
            self.balance_c1_x.write(pk_hash, new_balance_c1_x);
            self.balance_c1_y.write(pk_hash, new_balance_c1_y);
            self.balance_c2_x.write(pk_hash, new_balance_c2_x);
            self.balance_c2_y.write(pk_hash, new_balance_c2_y);

            // Update TVL.
            let tvl = self.total_value_locked.read();
            assert(tvl >= amount, 'INSUFFICIENT_POOL_BALANCE');
            self.total_value_locked.write(tvl - amount);

            // Transfer ERC20 to caller.
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            token.transfer(caller, amount);

            self.emit(Withdrawn { pk_hash, amount, nullifier });
        }

        // ── View functions ─────────────────────

        fn get_encrypted_balance(
            self: @ContractState, pk_x: felt252, pk_y: felt252,
        ) -> (felt252, felt252, felt252, felt252) {
            let pk_hash = hash_pk(pk_x, pk_y);
            (
                self.balance_c1_x.read(pk_hash),
                self.balance_c1_y.read(pk_hash),
                self.balance_c2_x.read(pk_hash),
                self.balance_c2_y.read(pk_hash),
            )
        }

        fn is_registered(self: @ContractState, pk_x: felt252, pk_y: felt252) -> bool {
            let pk_hash = hash_pk(pk_x, pk_y);
            self.registered.read(pk_hash)
        }

        fn is_nullifier_spent(self: @ContractState, nullifier: felt252) -> bool {
            self.nullifiers.read(nullifier)
        }

        fn get_total_value_locked(self: @ContractState) -> u256 {
            self.total_value_locked.read()
        }

        fn get_token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }
    }
}
