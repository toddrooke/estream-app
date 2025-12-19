/**
 * Governance Proposal Modal
 * 
 * Displays governance proposals and allows voting
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';

interface GovernanceProposalProps {
  visible: boolean;
  message: any;
  onVote: (option: string) => void;
  onClose: () => void;
}

export function GovernanceProposalModal({ visible, message, onVote, onClose }: GovernanceProposalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  
  if (!message) return null;
  
  const data = message.data;
  const daysRemaining = Math.ceil((data.deadline - Date.now()) / (1000 * 60 * 60 * 24));
  
  const handleVote = async () => {
    if (!selectedOption) return;
    
    setIsVoting(true);
    try {
      await onVote(selectedOption);
    } finally {
      setIsVoting(false);
    }
  };
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🗳️ Governance Proposal</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.proposalHeader}>
            <Text style={styles.proposalTitle}>{data.title || 'Untitled Proposal'}</Text>
            <View style={styles.deadlineBadge}>
              <Text style={styles.deadlineText}>
                {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Voting ended'}
              </Text>
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.description}>{data.description || 'No description provided'}</Text>
          </View>
          
          {data.proposer && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Proposed By</Text>
              <Text style={styles.proposer}>{data.proposer}</Text>
            </View>
          )}
          
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your Voting Power</Text>
            <Text style={styles.votingPower}>
              {data.voting_power ? `${data.voting_power.toLocaleString()} votes` : 'N/A'}
            </Text>
          </View>
          
          {data.current_results && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Current Results</Text>
              {Object.entries(data.current_results).map(([option, votes]: [string, any]) => (
                <View key={option} style={styles.resultRow}>
                  <Text style={styles.resultOption}>{option}</Text>
                  <Text style={styles.resultVotes}>{votes.toLocaleString()} votes</Text>
                </View>
              ))}
            </View>
          )}
          
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cast Your Vote</Text>
            {data.options && data.options.map((option: string) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.option,
                  selectedOption === option && styles.optionSelected
                ]}
                onPress={() => setSelectedOption(option)}
                disabled={daysRemaining <= 0}
              >
                <View style={styles.optionRadio}>
                  {selectedOption === option && <View style={styles.optionRadioSelected} />}
                </View>
                <Text style={[
                  styles.optionText,
                  selectedOption === option && styles.optionTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonPrimary,
              (!selectedOption || isVoting || daysRemaining <= 0) && styles.buttonDisabled
            ]}
            onPress={handleVote}
            disabled={!selectedOption || isVoting || daysRemaining <= 0}
          >
            {isVoting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Submit Vote</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  proposalHeader: {
    marginBottom: 24,
  },
  proposalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  deadlineBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 12,
  },
  deadlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    fontSize: 16,
    color: '#E5E5E7',
    lineHeight: 22,
  },
  proposer: {
    fontSize: 14,
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  votingPower: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  resultOption: {
    fontSize: 14,
    color: '#FFF',
  },
  resultVotes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  optionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8E8E93',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRadioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  optionText: {
    fontSize: 16,
    color: '#FFF',
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#1C1C1E',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

