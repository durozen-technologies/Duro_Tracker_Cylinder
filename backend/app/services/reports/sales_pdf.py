from dataclasses import dataclass
from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass
class SalesPdfItemData:
    item_name: str
    qty: int
    rate: float
    amount: float

@dataclass
class SalesPdfBillData:
    date: str
    bill_no: str
    items: List[SalesPdfItemData]

@dataclass
class SalesPdfBuyerSummary:
    buyer_name: str
    bills: List[SalesPdfBillData]
    total_amount: float

@dataclass
class SalesPdfData:
    org_name: str
    org_address: str
    org_phone: str
    
    buyer_name: str
    buyer_phone: str
    
    date_display_text: str
    
    buyer_summaries: List[SalesPdfBuyerSummary]


def generate_sales_pdf(data: SalesPdfData) -> BytesIO:
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
    section_header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        textColor=colors.white,
    )
    buyer_header_style = ParagraphStyle(
        'BuyerHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        textColor=colors.white,
    )
    
    # 1. Header (Two columns: Org Info on Left, "SALES REPORT" on Right)
    org_info = [Paragraph(data.org_name, org_name_style)]
    if data.org_address:
        org_info.append(Paragraph(data.org_address, normal_text_style))
    if data.org_phone:
        org_info.append(Paragraph(f"Phone: {data.org_phone}", normal_text_style))
    
    report_title = [
        Paragraph("SALES REPORT", title_style)
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
    
    # 2. Context Box (Buyer Info & Date Range)
    buyer_info = [
        Paragraph("<b>BILLED TO:</b>", ParagraphStyle('BilledTo', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#777777'))),
        Spacer(1, 4),
        Paragraph(f"<b>{data.buyer_name}</b>", ParagraphStyle('BuyerName', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=12, textColor=colors.black)),
        Paragraph(f"Phone: {data.buyer_phone}", normal_text_style) if data.buyer_phone else ""
    ]
    
    date_info = [
        Paragraph("<b>REPORT PERIOD:</b>", ParagraphStyle('PeriodLabel', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#777777'), alignment=TA_RIGHT)),
        Spacer(1, 4),
        Paragraph(f"<b>{data.date_display_text}</b>", ParagraphStyle('PeriodText', parent=normal_text_style, fontName='Helvetica-Bold', fontSize=11, textColor=colors.black, alignment=TA_RIGHT))
    ]
    
    context_table = Table([[buyer_info, date_info]], colWidths=['50%', '50%'])
    context_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('TOPPADDING', (0,0), (-1,-1), 15),
        ('BOTTOMPADDING', (0,0), (-1,-1), 15),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
        ('RIGHTPADDING', (0,0), (-1,-1), 15),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E2E8F0'))
    ]))
    elements.append(context_table)
    elements.append(Spacer(1, 20))
    
    # 3. Invoice Table (Grouped layout by Buyer)
    table_data = []
    
    # Global headers for items
    header_row = [
        "Item Name", "Qty", "Rate (Rs)", "Amount (Rs)"
    ]
    table_data.append(header_row)
    
    # Column widths
    col_widths = [245, 70, 110, 110]
    
    row_styles = []
    current_row_idx = 1 # 0 is global header
    
    grand_total_amount = 0.0
    
    for summary in data.buyer_summaries:
        grand_total_amount += summary.total_amount
        
        # Add Buyer Group Header
        if len(data.buyer_summaries) > 1:
            buyer_header_text = f"BUYER: {summary.buyer_name.upper()}"
            table_data.append([Paragraph(buyer_header_text, buyer_header_style), "", "", ""])
            
            row_styles.append(('SPAN', (0, current_row_idx), (-1, current_row_idx)))
            row_styles.append(('BACKGROUND', (0, current_row_idx), (-1, current_row_idx), colors.HexColor('#1E293B')))
            row_styles.append(('BOTTOMPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
            row_styles.append(('TOPPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
            
            current_row_idx += 1
            
        for bill in summary.bills:
            num_items = len(bill.items)
            if num_items == 0:
                continue
                
            # Add Bill Sub-header
            bill_header_text = f"Date: {bill.date}  |  Bill No: {bill.bill_no}"
            table_data.append([Paragraph(bill_header_text, section_header_style), "", "", ""])
            
            # Style for the sub-header row
            row_styles.append(('SPAN', (0, current_row_idx), (-1, current_row_idx)))
            row_styles.append(('BACKGROUND', (0, current_row_idx), (-1, current_row_idx), colors.HexColor('#334155')))
            row_styles.append(('BOTTOMPADDING', (0, current_row_idx), (-1, current_row_idx), 6))
            row_styles.append(('TOPPADDING', (0, current_row_idx), (-1, current_row_idx), 6))
            
            current_row_idx += 1
                
            for i, item in enumerate(bill.items):
                rate_str = f"{item.rate:,.2f}"
                amount_str = f"{item.amount:,.2f}"
                qty_str = f"{item.qty} Nos"
                
                row = [
                    Paragraph(item.item_name, styles['Normal']), 
                    qty_str, 
                    rate_str, 
                    amount_str
                ]
                table_data.append(row)
                
                # Add a light bottom border to each item row
                row_styles.append(('LINEBELOW', (0, current_row_idx), (-1, current_row_idx), 1, colors.HexColor('#E2E8F0')))
                row_styles.append(('VALIGN', (0, current_row_idx), (-1, current_row_idx), 'MIDDLE'))
                row_styles.append(('TOPPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
                row_styles.append(('BOTTOMPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
                
                current_row_idx += 1
                
        # Add Subtotal for Buyer
        if len(data.buyer_summaries) > 1:
            table_data.append([
                Paragraph(f'<b>Total for {summary.buyer_name}</b>', ParagraphStyle('r', fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#1E293B'), alignment=TA_RIGHT)),
                "", "", 
                Paragraph(f"<b>Rs. {summary.total_amount:,.2f}</b>", ParagraphStyle('r', fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#1E293B'), alignment=TA_RIGHT))
            ])
            row_styles.append(('SPAN', (0, current_row_idx), (2, current_row_idx)))
            row_styles.append(('BACKGROUND', (0, current_row_idx), (-1, current_row_idx), colors.HexColor('#F1F5F9')))
            row_styles.append(('BOTTOMPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
            row_styles.append(('TOPPADDING', (0, current_row_idx), (-1, current_row_idx), 8))
            current_row_idx += 1

    invoice_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    base_table_style = [
        # Global Header styling
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#334155')),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('TOPPADDING', (0,0), (-1,0), 8),
        ('LINEBELOW', (0,0), (-1,0), 2, colors.HexColor('#CBD5E1')),
        
        # Alignments
        ('ALIGN', (0,0), (0,-1), 'LEFT'),
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('ALIGN', (2,0), (3,-1), 'RIGHT'),
    ]
    
    invoice_table.setStyle(TableStyle(base_table_style + row_styles))
    elements.append(invoice_table)
    elements.append(Spacer(1, 20))
    
    # 4. Summary Section
    summary_data = [
        [
            Paragraph('<b>GRAND TOTAL</b>', ParagraphStyle('s', fontName='Helvetica-Bold', fontSize=12, textColor=colors.HexColor('#334155'))), 
            Paragraph(f"<b>Rs. {grand_total_amount:,.2f}</b>", ParagraphStyle('r', fontName='Helvetica-Bold', fontSize=14, textColor=colors.black, alignment=TA_RIGHT))
        ]
    ]
    summary_table = Table(summary_data, colWidths=[200, 150])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 2, colors.HexColor('#2C3E50')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
        ('RIGHTPADDING', (0,0), (-1,-1), 15),
    ]))
    
    # Right-align the summary box on the page
    layout_table = Table([["", summary_table]], colWidths=[185, 350])
    layout_table.setStyle(TableStyle([
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
    ]))
    
    elements.append(layout_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

