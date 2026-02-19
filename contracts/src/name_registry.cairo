/// Veil Name Service (VNS) — .veil Domain Registry
///
/// Maps human-readable names (e.g. "pious" → "pious.veil") to ElGamal
/// public keys. Names are stored as felt252 short strings (≤ 31 ASCII bytes).
///
/// Registration requires the caller to already be registered in ShieldedPool,
/// ensuring only active pool participants can claim names.

/// Minimal interface to query ShieldedPool registration status.
#[starknet::interface]
pub trait IShieldedPoolQuery<TContractState> {
    fn is_registered(self: @TContractState, pk_x: felt252, pk_y: felt252) -> bool;
}

#[starknet::interface]
pub trait IVeilNameRegistry<TContractState> {
    /// Register a .veil name for the calling address.
    /// Requirements:
    ///   - name must be non-zero (non-empty)
    ///   - name must not already be taken
    ///   - caller must not already hold a name
    ///   - caller must be registered in ShieldedPool with the given pk
    fn register_name(ref self: TContractState, name: felt252, pk_x: felt252, pk_y: felt252);

    /// Resolve a name to its ElGamal public key.
    /// Returns (0, 0) if the name is not registered.
    fn resolve(self: @TContractState, name: felt252) -> (felt252, felt252);

    /// Get the .veil name for a given Starknet address.
    /// Returns 0 if the address has no registered name.
    fn get_name(self: @TContractState, address: starknet::ContractAddress) -> felt252;

    /// Check whether a name is already taken.
    fn is_name_taken(self: @TContractState, name: felt252) -> bool;
}

#[starknet::contract]
pub mod VeilNameRegistry {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::{IShieldedPoolQueryDispatcher, IShieldedPoolQueryDispatcherTrait};
    use super::IVeilNameRegistry;

    // ────────────────────────────────────────────
    //  Storage
    // ────────────────────────────────────────────

    #[storage]
    struct Storage {
        /// Address of the ShieldedPool contract, queried to verify registration.
        shielded_pool: ContractAddress,
        /// name (felt252 short string) → ElGamal pk_x
        name_to_pk_x: Map<felt252, felt252>,
        /// name (felt252 short string) → ElGamal pk_y
        name_to_pk_y: Map<felt252, felt252>,
        /// Starknet address (as felt252) → name
        address_to_name: Map<felt252, felt252>,
        /// name → taken flag (prevents double-registration)
        name_taken: Map<felt252, bool>,
    }

    // ────────────────────────────────────────────
    //  Events
    // ────────────────────────────────────────────

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        NameRegistered: NameRegistered,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NameRegistered {
        #[key]
        pub name: felt252,
        pub pk_x: felt252,
        pub pk_y: felt252,
        pub address: ContractAddress,
    }

    // ────────────────────────────────────────────
    //  Constructor
    // ────────────────────────────────────────────

    #[constructor]
    fn constructor(ref self: ContractState, shielded_pool: ContractAddress) {
        self.shielded_pool.write(shielded_pool);
    }

    // ────────────────────────────────────────────
    //  Implementation
    // ────────────────────────────────────────────

    #[abi(embed_v0)]
    impl VeilNameRegistryImpl of IVeilNameRegistry<ContractState> {
        fn register_name(ref self: ContractState, name: felt252, pk_x: felt252, pk_y: felt252) {
            let caller = get_caller_address();
            let caller_felt: felt252 = caller.into();

            // Name must be non-empty.
            assert(name != 0, 'INVALID_NAME');

            // Name must not already be taken.
            assert(!self.name_taken.read(name), 'NAME_TAKEN');

            // Caller must not already hold a name.
            assert(self.address_to_name.read(caller_felt) == 0, 'ADDRESS_ALREADY_NAMED');

            // Caller must be registered in ShieldedPool with the given public key.
            let pool = IShieldedPoolQueryDispatcher {
                contract_address: self.shielded_pool.read(),
            };
            assert(pool.is_registered(pk_x, pk_y), 'NOT_REGISTERED_IN_POOL');

            // Store all three mappings.
            self.name_to_pk_x.write(name, pk_x);
            self.name_to_pk_y.write(name, pk_y);
            self.address_to_name.write(caller_felt, name);
            self.name_taken.write(name, true);

            self.emit(NameRegistered { name, pk_x, pk_y, address: caller });
        }

        fn resolve(self: @ContractState, name: felt252) -> (felt252, felt252) {
            (self.name_to_pk_x.read(name), self.name_to_pk_y.read(name))
        }

        fn get_name(self: @ContractState, address: ContractAddress) -> felt252 {
            let addr_felt: felt252 = address.into();
            self.address_to_name.read(addr_felt)
        }

        fn is_name_taken(self: @ContractState, name: felt252) -> bool {
            self.name_taken.read(name)
        }
    }
}
