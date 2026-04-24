import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

function TabItem({
  label,
  icon,
  color,
  size,
}: {
  label: string;
  icon: IonName;
  color: string;
  size: number;
}) {
  return (
    <View style={styles.item}>
      <Ionicons name={icon} size={size} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="trips"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 10,
          paddingBottom: 10,
        },
        tabBarShowLabel: false,
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="trips"
        options={{
          title: '외근',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="외근" icon="briefcase" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="fields"
        options={{
          title: '현장',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="현장" icon="location" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: '보고서',
          tabBarIcon: ({ color, size }) => (
            <TabItem
              label="보고서"
              icon="document-text"
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
    textAlign: 'center',
  },
});
