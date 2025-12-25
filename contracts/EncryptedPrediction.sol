// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedPrediction is ZamaEthereumConfig {
    struct Prediction {
        string title;
        string[] options;
        euint32[] encryptedCounts;
        bool isActive;
        bool resultsArePublic;
        uint256 createdAt;
        uint256 closedAt;
    }

    uint256 public predictionCount;
    mapping(uint256 => Prediction) private predictions;
    mapping(uint256 => mapping(address => bool)) private hasVoted;

    error InvalidPrediction();
    error InvalidOptionCount();
    error PredictionAlreadyClosed();
    error AlreadyVoted();

    event PredictionCreated(uint256 indexed predictionId, string title, string[] options);
    event VoteSubmitted(uint256 indexed predictionId, address indexed voter);
    event PredictionClosed(uint256 indexed predictionId, uint256 closedAt);

    function createPrediction(string memory title, string[] memory options) external returns (uint256 predictionId) {
        if (options.length < 2 || options.length > 4) {
            revert InvalidOptionCount();
        }
        for (uint256 i = 0; i < options.length; i++) {
            if (bytes(options[i]).length == 0) {
                revert InvalidPrediction();
            }
        }

        predictionId = predictionCount;
        predictionCount += 1;

        Prediction storage prediction = predictions[predictionId];
        prediction.title = title;
        prediction.isActive = true;
        prediction.resultsArePublic = false;
        prediction.createdAt = block.timestamp;
        prediction.options = options;

        prediction.encryptedCounts = new euint32[](options.length);
        euint32 zero = FHE.asEuint32(0);
        for (uint256 i = 0; i < options.length; i++) {
            prediction.encryptedCounts[i] = zero;
            FHE.allowThis(prediction.encryptedCounts[i]);
        }

        emit PredictionCreated(predictionId, title, options);
    }

    function submitVote(uint256 predictionId, externalEuint32 encryptedChoice, bytes calldata inputProof) external {
        Prediction storage prediction = predictions[predictionId];
        if (prediction.options.length == 0) {
            revert InvalidPrediction();
        }
        if (!prediction.isActive) {
            revert PredictionAlreadyClosed();
        }
        if (hasVoted[predictionId][msg.sender]) {
            revert AlreadyVoted();
        }

        euint32 choice = FHE.fromExternal(encryptedChoice, inputProof);
        euint32 increment = FHE.asEuint32(1);

        for (uint256 i = 0; i < prediction.encryptedCounts.length; i++) {
            ebool isSelected = FHE.eq(choice, FHE.asEuint32(uint32(i)));
            euint32 updated = FHE.add(prediction.encryptedCounts[i], increment);
            prediction.encryptedCounts[i] = FHE.select(isSelected, updated, prediction.encryptedCounts[i]);
            FHE.allowThis(prediction.encryptedCounts[i]);
            FHE.allow(prediction.encryptedCounts[i], msg.sender);
        }

        hasVoted[predictionId][msg.sender] = true;
        emit VoteSubmitted(predictionId, msg.sender);
    }

    function closePrediction(uint256 predictionId) external {
        Prediction storage prediction = predictions[predictionId];
        if (prediction.options.length == 0) {
            revert InvalidPrediction();
        }
        if (!prediction.isActive) {
            revert PredictionAlreadyClosed();
        }

        prediction.isActive = false;
        prediction.resultsArePublic = true;
        prediction.closedAt = block.timestamp;

        for (uint256 i = 0; i < prediction.encryptedCounts.length; i++) {
            FHE.makePubliclyDecryptable(prediction.encryptedCounts[i]);
        }

        emit PredictionClosed(predictionId, prediction.closedAt);
    }

    function getPrediction(
        uint256 predictionId
    )
        external
        view
        returns (
            string memory title,
            string[] memory options,
            euint32[] memory encryptedCounts,
            bool isActive,
            bool resultsArePublic,
            uint256 createdAt,
            uint256 closedAt
        )
    {
        Prediction storage prediction = predictions[predictionId];
        if (prediction.options.length == 0) {
            revert InvalidPrediction();
        }

        return (
            prediction.title,
            prediction.options,
            prediction.encryptedCounts,
            prediction.isActive,
            prediction.resultsArePublic,
            prediction.createdAt,
            prediction.closedAt
        );
    }

    function getEncryptedCounts(uint256 predictionId) external view returns (euint32[] memory encryptedCounts) {
        Prediction storage prediction = predictions[predictionId];
        if (prediction.options.length == 0) {
            revert InvalidPrediction();
        }
        return prediction.encryptedCounts;
    }

    function getPredictionCount() external view returns (uint256) {
        return predictionCount;
    }

    function getOptionCount(uint256 predictionId) external view returns (uint256) {
        if (predictions[predictionId].options.length == 0) {
            revert InvalidPrediction();
        }
        return predictions[predictionId].options.length;
    }

    function hasUserVoted(uint256 predictionId, address account) external view returns (bool) {
        if (predictions[predictionId].options.length == 0) {
            revert InvalidPrediction();
        }
        return hasVoted[predictionId][account];
    }
}
