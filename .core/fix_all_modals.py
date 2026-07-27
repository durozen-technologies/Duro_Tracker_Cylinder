import re
import os

files = [
    r'd:\Duro_Tracker\frontend\src\screens\admin\PurchasesScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\ItemsScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\BuyersScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\InventoryScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\SettingsScreen.tsx'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Step 1: Add KeyboardAvoidingView and Platform to react-native import
    import_match = re.search(r'import\s+{([^}]+)}\s+from\s+[\'"]react-native[\'"];', content)
    if import_match:
        imports = [i.strip() for i in import_match.group(1).split(',')]
        if 'KeyboardAvoidingView' not in imports:
            imports.append('KeyboardAvoidingView')
        if 'Platform' not in imports:
            imports.append('Platform')
        
        new_import_str = 'import { ' + ', '.join(imports) + " } from 'react-native';"
        content = content[:import_match.start()] + new_import_str + content[import_match.end():]

    # Step 2: Strip any existing KeyboardAvoidingView wrappers that might have been partially added
    content = re.sub(r'<KeyboardAvoidingView[^>]*>', '', content)
    content = re.sub(r'</KeyboardAvoidingView>', '', content)

    # Step 3: Inject KeyboardAvoidingView right inside Modal
    # We will match `<Modal ...>` and `</Modal>`
    # But wait, self-closing Modals `<Modal ... />` should not be matched. None exist here.
    
    # Add wrapper after <Modal ...>
    content = re.sub(
        r'(<Modal[^>]*?(?<!/)>)',
        r'\1\n        <KeyboardAvoidingView behavior={Platform.OS === \'ios\' ? \'padding\' : \'height\'} style={{ flex: 1 }}>',
        content
    )
    
    # Add wrapper before </Modal>
    content = re.sub(
        r'(</Modal>)',
        r'        </KeyboardAvoidingView>\n      \1',
        content
    )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print('Updated all modals to use KeyboardAvoidingView safely')
