# KoshurKart Payment System Architecture

## Overview

This directory contains the **authoritative target architecture** for the KoshurKart payment system.

These documents define how the payment infrastructure is expected to function after the complete payment recovery roadmap has been implemented. They are **not a description of the current implementation**. Instead, they describe the intended end-state architecture that all future payment-related development must follow.

Any change affecting payments, payouts, refunds, returns, commission calculation, ledger management, reconciliation, or financial workflows should be evaluated against these documents before implementation.

---

# Purpose

The goals of this architecture are to:

* Provide a single source of truth for the payment system.
* Prevent architectural drift between database, Edge Functions, and frontend.
* Ensure secure, auditable, and deterministic money movement.
* Standardize payment workflows across the platform.
* Maintain long-term consistency as the system evolves.

---

# Document Structure

Read the documents in the following order:

| Order | Document                                    | Purpose                                                                                                                         |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **01-core-architecture-specification.md**   | Core architectural principles, ownership, responsibilities, invariants, and system boundaries.                                  |
| 2     | **02-state-machines.md**                    | Payment, payout, return, refund, escalation, and reconciliation workflows.                                                      |
| 3     | **03-database-ledger-specification.md**     | Target database schema, unified ledger design, RPC contracts, locking strategy, idempotency, and reconciliation implementation. |
| 4     | **04-operational-standards.md**             | Error handling, testing standards, deployment rules, coding conventions, and review checklist.                                  |
| 5     | **05-architecture-decisions.md** *(Future)* | Architecture Decision Records (ADRs) documenting major design decisions and their rationale.                                    |

---

# Scope

These documents cover:

* Payment architecture
* Razorpay integration
* Razorpay Route transfers
* Commission calculation
* Unified financial ledger
* Vendor payouts
* Refunds and returns
* Reconciliation
* Idempotency
* Error contracts
* Security boundaries
* Operational standards

---

# Implementation Rule

The implementation roadmap and all future payment development **must conform to these architecture documents**.

If implementation and architecture disagree:

* Update the architecture first **or**
* Modify the implementation to match the architecture.

The architecture must never be silently bypassed by individual code changes.

---

# Version

**Project:** KoshurKart

**Status:** Authoritative Target Architecture

**Version:** 1.0

**Owner:** KoshurKart Engineering Team
