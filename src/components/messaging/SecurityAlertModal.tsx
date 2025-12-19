/**
 * Security Alert Modal
 * 
 * Displays security alerts from the eStream platform
 * Supports different severity levels and action buttons
 */

import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';

interface SecurityAlertProps {
  visible: boolean;
  message: any;
  onAcknowledge: () => void;
  onAction: (actionId: string) => void;
}

export function SecurityAlertModal({ visible, message, onAcknowledge, onAction }: SecurityAlertProps) {
  if (!message) return null;
  
  const data = message.data;
  const severity = data.severity || 'medium';
  
  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={[styles.container, { borderColor: getSeverityColor(severity) }]}>
          <View style={[styles.header, { backgroundColor: getSeverityColor(severity) }]}>
            <Text style={styles.severityIcon}>{getSeverityIcon(severity)}</Text>
            <Text style={styles.severityText}>{severity.toUpperCase()}</Text>
          </View>
          
          <ScrollView style={styles.content}>
            <Text style={styles.title}>{data.title || 'Security Alert'}</Text>
            <Text style={styles.description}>{data.description || 'No description provided'}</Text>
            
            {data.affected_resources && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Affected Resources</Text>
                {data.affected_resources.map((resource: string, index: number) => (
                  <Text key={index} style={styles.resource}>• {resource}</Text>
                ))}
              </View>
            )}
            
            {data.recommended_actions && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Recommended Actions</Text>
                {data.recommended_actions.map((action: string, index: number) => (
                  <Text key={index} style={styles.recommendation}>
                    {index + 1}. {action}
                  </Text>
                ))}
              </View>
            )}
            
            {data.timestamp && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Detected At</Text>
                <Text style={styles.timestamp}>
                  {new Date(data.timestamp).toLocaleString()}
                </Text>
              </View>
            )}
          </ScrollView>
          
          <View style={styles.actions}>
            {data.actions && data.actions.map((action: any) => (
              <TouchableOpacity
                key={action.action_id}
                style={[styles.button, getActionStyle(action.style)]}
                onPress={() => onAction(action.action_id)}
              >
                <Text style={styles.buttonText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={[styles.button, styles.buttonAcknowledge]}
              onPress={onAcknowledge}
            >
              <Text style={styles.buttonText}>Acknowledge</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '#FF3B30';
    case 'high':
      return '#FF9500';
    case 'medium':
      return '#FFCC00';
    case 'low':
      return '#34C759';
    default:
      return '#8E8E93';
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '⚡';
    case 'low':
      return 'ℹ️';
    default:
      return '🔐';
  }
}

function getActionStyle(style?: string): any {
  switch (style) {
    case 'destructive':
      return { backgroundColor: '#FF3B30' };
    case 'primary':
      return { backgroundColor: '#007AFF' };
    default:
      return { backgroundColor: '#1C1C1E' };
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#000',
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  severityIcon: {
    fontSize: 24,
  },
  severityText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 1,
  },
  content: {
    maxHeight: 400,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#E5E5E7',
    lineHeight: 22,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resource: {
    fontSize: 14,
    color: '#E5E5E7',
    marginBottom: 4,
  },
  recommendation: {
    fontSize: 14,
    color: '#E5E5E7',
    lineHeight: 20,
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actions: {
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonAcknowledge: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

