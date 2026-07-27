import re
import os

file = r'd:\Duro_Tracker\frontend\src\screens\admin\PurchasesScreen.tsx'
with open(file, 'r', encoding='utf-8') as f:
    content = f.read()

# Import SafeAreaView
if 'react-native-safe-area-context' not in content:
    content = content.replace("from 'react-native';", "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';")

# Fix first return
content = content.replace(
    'return (\n      <View className="flex-1 bg-gray-50 p-4 pt-12">\n        {renderProviderCRM()}', 
    'return (\n      <SafeAreaView edges={[\'top\']} className="flex-1 bg-gray-50">\n      <View className="flex-1 p-4">\n        {renderProviderCRM()}'
)
# Fix end of first return
content = content.replace(
    '        />\n      </View>\n    );\n  }', 
    '        />\n      </View>\n      </SafeAreaView>\n    );\n  }'
)

# Fix second return
content = content.replace(
    '  return (\n    <View className="flex-1 bg-gray-50 p-4 pt-12">\n      <View className="flex flex-row justify-between items-start mb-6">', 
    '  return (\n    <SafeAreaView edges={[\'top\']} className="flex-1 bg-gray-50">\n    <View className="flex-1 p-4">\n      <View className="flex flex-row justify-between items-start mb-6">'
)

# Fix end of file
content = content.replace(
    '        />\n    </View>\n  );\n}\n', 
    '        />\n    </View>\n    </SafeAreaView>\n  );\n}\n'
)

# Set flatlist padding to 100
content = content.replace(
    'contentContainerStyle={{ paddingBottom: 40 }}',
    'contentContainerStyle={{ paddingBottom: 100 }}'
)

with open(file, 'w', encoding='utf-8') as f:
    f.write(content)
print('PurchasesScreen updated')
