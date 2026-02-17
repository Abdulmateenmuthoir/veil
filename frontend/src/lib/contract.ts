/** ShieldedPool ABI — extracted from compiled sierra contract. */
export const SHIELDED_POOL_ABI = [
  {
    type: "impl",
    name: "ShieldedPoolImpl",
    interface_name: "veil::shielded_pool::IShieldedPool",
  },
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "enum",
    name: "core::bool",
    variants: [
      { name: "False", type: "()" },
      { name: "True", type: "()" },
    ],
  },
  {
    type: "interface",
    name: "veil::shielded_pool::IShieldedPool",
    items: [
      {
        type: "function",
        name: "register",
        inputs: [
          { name: "pk_x", type: "core::felt252" },
          { name: "pk_y", type: "core::felt252" },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "deposit",
        inputs: [
          { name: "amount", type: "core::integer::u256" },
          { name: "new_balance_c1_x", type: "core::felt252" },
          { name: "new_balance_c1_y", type: "core::felt252" },
          { name: "new_balance_c2_x", type: "core::felt252" },
          { name: "new_balance_c2_y", type: "core::felt252" },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "transfer",
        inputs: [
          { name: "recipient_pk_x", type: "core::felt252" },
          { name: "recipient_pk_y", type: "core::felt252" },
          { name: "new_sender_balance_c1_x", type: "core::felt252" },
          { name: "new_sender_balance_c1_y", type: "core::felt252" },
          { name: "new_sender_balance_c2_x", type: "core::felt252" },
          { name: "new_sender_balance_c2_y", type: "core::felt252" },
          { name: "new_recipient_balance_c1_x", type: "core::felt252" },
          { name: "new_recipient_balance_c1_y", type: "core::felt252" },
          { name: "new_recipient_balance_c2_x", type: "core::felt252" },
          { name: "new_recipient_balance_c2_y", type: "core::felt252" },
          { name: "proof_hash", type: "core::felt252" },
          { name: "nullifier", type: "core::felt252" },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "withdraw",
        inputs: [
          { name: "amount", type: "core::integer::u256" },
          { name: "new_balance_c1_x", type: "core::felt252" },
          { name: "new_balance_c1_y", type: "core::felt252" },
          { name: "new_balance_c2_x", type: "core::felt252" },
          { name: "new_balance_c2_y", type: "core::felt252" },
          { name: "proof_hash", type: "core::felt252" },
          { name: "nullifier", type: "core::felt252" },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "get_encrypted_balance",
        inputs: [
          { name: "pk_x", type: "core::felt252" },
          { name: "pk_y", type: "core::felt252" },
        ],
        outputs: [
          {
            type: "(core::felt252, core::felt252, core::felt252, core::felt252)",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "is_registered",
        inputs: [
          { name: "pk_x", type: "core::felt252" },
          { name: "pk_y", type: "core::felt252" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "is_nullifier_spent",
        inputs: [{ name: "nullifier", type: "core::felt252" }],
        outputs: [{ type: "core::bool" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_total_value_locked",
        inputs: [],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_token",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "owner",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
  {
    type: "event",
    name: "veil::shielded_pool::ShieldedPool::Event",
    kind: "enum",
    variants: [
      {
        name: "Registered",
        type: "veil::shielded_pool::ShieldedPool::Registered",
        kind: "nested",
      },
      {
        name: "Deposited",
        type: "veil::shielded_pool::ShieldedPool::Deposited",
        kind: "nested",
      },
      {
        name: "TransferExecuted",
        type: "veil::shielded_pool::ShieldedPool::TransferExecuted",
        kind: "nested",
      },
      {
        name: "Withdrawn",
        type: "veil::shielded_pool::ShieldedPool::Withdrawn",
        kind: "nested",
      },
    ],
  },
] as const;

/** Standard ERC20 approve ABI entry for multicall. */
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "core::starknet::contract_address::ContractAddress",
      },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
] as const;
