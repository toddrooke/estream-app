/**
 * Estream Event Log Component
 * 
 * Displays real-time estream events for debugging and development.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { EstreamService, EstreamEvent } from '@/services/estream';

interface EventLogProps {
  maxHeight?: number;
  onEventPress?: (event: EstreamEvent) => void;
}

const EVENT_COLORS = {
  create: '#22c55e',  // green
  sign: '#3b82f6',    // blue
  verify: '#a855f7',  // purple
  emit: '#f97316',    // orange
  receive: '#06b6d4', // cyan
  parse: '#64748b',   // slate
  error: '#ef4444',   // red
};

const EVENT_ICONS = {
  create: '➕',
  sign: '✍️',
  verify: '✓',
  emit: '📤',
  receive: '📥',
  parse: '🔍',
  error: '❌',
};

function EventItem({ 
  event, 
  onPress 
}: { 
  event: EstreamEvent; 
  onPress?: () => void;
}) {
  const [fadeAnim] = useState(new Animated.Value(0));
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const color = EVENT_COLORS[event.type] || EVENT_COLORS.error;
  const icon = EVENT_ICONS[event.type] || '❓';
  
  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity 
        style={[styles.eventItem, { borderLeftColor: color }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          <Text style={styles.eventIcon}>{icon}</Text>
          <Text style={[styles.eventType, { color }]}>
            {event.type.toUpperCase()}
          </Text>
          <Text style={styles.eventTime}>
            {event.timestamp.toLocaleTimeString()}
          </Text>
          <View style={[
            styles.statusDot, 
            { backgroundColor: event.success ? '#22c55e' : '#ef4444' }
          ]} />
        </View>
        
        {event.contentId && typeof event.contentId === 'string' && (
          <Text style={styles.contentId} numberOfLines={1}>
            {event.contentId.substring(0, Math.min(16, event.contentId.length))}...
          </Text>
        )}
        
        <View style={styles.eventDetails}>
          {event.typeNum !== undefined && (
            <Text style={styles.detailText}>type: 0x{event.typeNum.toString(16)}</Text>
          )}
          {event.resource && (
            <Text style={styles.detailText} numberOfLines={1}>
              res: {event.resource}
            </Text>
          )}
          {event.payloadLen !== undefined && (
            <Text style={styles.detailText}>{event.payloadLen}B</Text>
          )}
          <Text style={styles.durationText}>{event.durationMs}ms</Text>
        </View>
        
        {event.details && (
          <Text style={styles.eventMessage} numberOfLines={2}>
            {event.details}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function EstreamEventLog({ maxHeight = 300, onEventPress }: EventLogProps) {
  const [events, setEvents] = useState<EstreamEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  
  useEffect(() => {
    // Load existing events
    setEvents(EstreamService.getEvents());
    
    // Subscribe to new events
    const unsubscribe = EstreamService.onEvent((event) => {
      setEvents(prev => [event, ...prev.slice(0, 49)]);
    });
    
    return unsubscribe;
  }, []);

  const handleClear = useCallback(() => {
    EstreamService.clearEvents();
    setEvents([]);
  }, []);

  if (!expanded) {
    return (
      <TouchableOpacity 
        style={styles.collapsedHeader}
        onPress={() => setExpanded(true)}
      >
        <Text style={styles.headerTitle}>📊 Event Log ({events.length})</Text>
        <Text style={styles.expandIcon}>▼</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { maxHeight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Text style={styles.headerTitle}>📊 Event Log ({events.length})</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpanded(false)}>
            <Text style={styles.expandIcon}>▲</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptyHint}>Create an estream to see events</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <EventItem 
              event={item} 
              onPress={() => onEventPress?.(item)} 
            />
          )}
          style={styles.list}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  collapsedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1f2937',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f3f4f6',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#374151',
    borderRadius: 4,
  },
  clearText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  expandIcon: {
    fontSize: 12,
    color: '#9ca3af',
  },
  list: {
    flex: 1,
  },
  eventItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    borderLeftWidth: 3,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  eventType: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 8,
  },
  eventTime: {
    fontSize: 10,
    color: '#6b7280',
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contentId: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#4ade80',
    marginBottom: 4,
  },
  eventDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  durationText: {
    fontSize: 10,
    color: '#60a5fa',
    fontWeight: '500',
  },
  eventMessage: {
    fontSize: 11,
    color: '#d1d5db',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 12,
    color: '#4b5563',
  },
});

