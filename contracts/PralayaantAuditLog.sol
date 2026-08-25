// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PralayaantAuditLog
 * @notice Immutable on-chain audit trail for urban infrastructure interventions.
 *         Deployed on Ethereum Sepolia Testnet for the Pralayaant ICCC Dashboard.
 * @dev    Optimized for minimal gas: short strings, packed struct, indexed event fields.
 */
contract PralayaantAuditLog {

    // ─── Data Structures ─────────────────────────────────────────────────────

    struct InterventionRecord {
        string   nodeId;       // e.g. "power-substation"
        string   assetId;      // e.g. "PWR-01"
        string   sector;       // e.g. "POWER"
        string   actionType;   // "SOLUTION" or "BLAST"
        string   title;        // e.g. "Emergency Diesel Generator"
        uint256  cost;         // Cost in INR (integer, no decimals)
        uint256  timestamp;    // Block timestamp at time of logging
        address  operator;     // Wallet address of the operator
    }

    // ─── State ───────────────────────────────────────────────────────────────

    InterventionRecord[] public records;

    // ─── Events ──────────────────────────────────────────────────────────────

    event InterventionLogged(
        uint256 indexed recordIndex,
        string  indexed nodeId,
        string  actionType,
        uint256 cost,
        address indexed operator,
        uint256 timestamp
    );

    // ─── Write Function ──────────────────────────────────────────────────────

    /**
     * @notice Log an infrastructure intervention on-chain.
     * @param _nodeId     Short node identifier (e.g. "power-substation")
     * @param _assetId    Asset code (e.g. "PWR-01")
     * @param _sector     Sector category (e.g. "POWER", "WATER", "HEALTH")
     * @param _actionType Action type: "SOLUTION" or "BLAST"
     * @param _title      Remedy or operation title
     * @param _cost       Cost in INR (integer)
     */
    function logIntervention(
        string calldata _nodeId,
        string calldata _assetId,
        string calldata _sector,
        string calldata _actionType,
        string calldata _title,
        uint256 _cost
    ) external {
        uint256 idx = records.length;

        records.push(InterventionRecord({
            nodeId:    _nodeId,
            assetId:   _assetId,
            sector:    _sector,
            actionType: _actionType,
            title:     _title,
            cost:      _cost,
            timestamp: block.timestamp,
            operator:  msg.sender
        }));

        emit InterventionLogged(
            idx,
            _nodeId,
            _actionType,
            _cost,
            msg.sender,
            block.timestamp
        );
    }

    // ─── Read Functions ──────────────────────────────────────────────────────

    /**
     * @notice Get a specific intervention record by index.
     */
    function getRecord(uint256 _index) external view returns (InterventionRecord memory) {
        require(_index < records.length, "Record index out of bounds");
        return records[_index];
    }

    /**
     * @notice Get the total number of logged interventions.
     */
    function getRecordCount() external view returns (uint256) {
        return records.length;
    }
}
