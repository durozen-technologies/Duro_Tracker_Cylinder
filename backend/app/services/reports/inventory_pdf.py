import datetime
from dataclasses import dataclass
from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass
class InventoryPdfItemData:
    item_name: str
    price: float
    current_full: int
    current_empty: int


@dataclass
class InventoryPdfData:
    org_name: str
    org_address: str
    org_phone: str
    
    items: List[InventoryPdfItemData]


def generate_inventory_pdf(data: InventoryPdfData) -> BytesIO:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=30, 
        leftMargin=30, 
        topMargin=30, 
        bottomMargin=30
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=24, 
        textColor=colors.HexColor('#2C3E50'),
        alignment=TA_RIGHT
    )
    org_name_style = ParagraphStyle(
        'OrgName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        spaceAfter=5,
        textColor=colors.HexColor('#2C3E50')
    )
    normal_text_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#444444'),
        leading=14
    )
    
    # 1. Header (Two columns: Org Info on Left, "INVENTORY REPORT" on Right)
    org_info = [Paragraph(data.org_name, org_name_style)]
    if data.org_address:
        org_info.append(Paragraph(data.org_address, normal_text_style))
    if data.org_phone:
        org_info.append(Paragraph(f"Phone: {data.org_phone}", normal_text_style))
    
    report_title = [
        Paragraph("INVENTORY REPORT", title_style)
    ]
    
    header_table = Table([[org_info, report_title]], colWidths=['60%', '40%'])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 20))
    
    # Separator Line
    elements.append(Table([['']], colWidths=['100%'], style=[
        ('LINEABOVE', (0,0), (-1,-1), 1, colors.HexColor('#2C3E50')),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(Spacer(1, 10))
    
    # 2. Context Box (Date Generated)
    date_info = [
        Paragraph("<b>REPORT GENERATED ON:</b>", ParagraphStyle('PeriodLabel', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#777777'), alignment=TA_CENTER)),
        Spacer(1, 4),
        Paragraph(f"<b>{datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</b>", ParagraphStyle('PeriodText', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=11, textColor=colors.black, alignment=TA_CENTER))
    ]
    
    context_table = Table([[date_info]], colWidths=['100%'])
    context_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('TOPPADDING', (0,0), (-1,-1), 15),
        ('BOTTOMPADDING', (0,0), (-1,-1), 15),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E2E8F0'))
    ]))
    elements.append(context_table)
    elements.append(Spacer(1, 20))
    
    # 3. Inventory Table
    table_data = [
        [
            Paragraph("<b>Item Name</b>", ParagraphStyle('TH', parent=normal_text_style, fontName='Helvetica-Bold', textColor=colors.white)),
            Paragraph("<b>Price</b>", ParagraphStyle('TH', parent=normal_text_style, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_RIGHT)),
            Paragraph("<b>Full Cylinders</b>", ParagraphStyle('TH', parent=normal_text_style, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_RIGHT)),
            Paragraph("<b>Empty Cylinders</b>", ParagraphStyle('TH', parent=normal_text_style, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_RIGHT)),
        ]
    ]
    
    total_full = 0
    total_empty = 0
    
    for item in data.items:
        table_data.append([
            Paragraph(item.item_name, normal_text_style),
            Paragraph(f"Rs. {item.price:,.2f}", ParagraphStyle('TDRight', parent=normal_text_style, alignment=TA_RIGHT)),
            Paragraph(str(item.current_full), ParagraphStyle('TDRight', parent=normal_text_style, alignment=TA_RIGHT)),
            Paragraph(str(item.current_empty), ParagraphStyle('TDRight', parent=normal_text_style, alignment=TA_RIGHT)),
        ])
        total_full += item.current_full
        total_empty += item.current_empty
        
    # Totals Row
    table_data.append([
        Paragraph("<b>TOTAL</b>", ParagraphStyle('TotalBold', parent=normal_text_style, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
        "",
        Paragraph(f"<b>{total_full}</b>", ParagraphStyle('TotalBoldRight', parent=normal_text_style, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
        Paragraph(f"<b>{total_empty}</b>", ParagraphStyle('TotalBoldRight', parent=normal_text_style, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
    ])
    
    inv_table = Table(table_data, colWidths=['40%', '20%', '20%', '20%'], repeatRows=1)
    inv_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#34495E')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('INNERGRID', (0,0), (-1,-2), 0.5, colors.HexColor('#E2E8F0')),
        
        # Totals row styling
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#F8FAFC')),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor('#2C3E50')),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, colors.HexColor('#2C3E50')),
        ('SPAN', (0,-1), (1,-1)),
    ]))
    elements.append(inv_table)
    
    doc.build(elements)
    
    buffer.seek(0)
    return buffer
