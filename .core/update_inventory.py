import re
import os

file = r'd:\Duro_Tracker\frontend\src\screens\admin\InventoryScreen.tsx'
with open(file, 'r', encoding='utf-8') as f:
    content = f.read()

# Import SafeAreaView correctly
content = content.replace(
    "import { View, Text, ScrollView, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';", 
    "import { View, Text, ScrollView, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';"
)

# Fix return
content = content.replace(
    '  return (\n    <View className="flex-1 bg-gray-50">\n      <ScrollView className="flex-1 p-4 pt-12">', 
    '  return (\n    <SafeAreaView edges={[\'top\']} className="flex-1 bg-gray-50">\n      <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>'
)

# Fix end of file
content = content.replace(
    '      </Modal>\n    </View>\n  );\n}\n', 
    '      </Modal>\n    </SafeAreaView>\n  );\n}\n'
)

with open(file, 'w', encoding='utf-8') as f:
    f.write(content)
print('InventoryScreen updated')
