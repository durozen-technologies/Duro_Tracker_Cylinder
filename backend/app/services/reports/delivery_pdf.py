from dataclasses import dataclass
from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass
class DeliveryPdfItemData:
    item_name: str
    full_qty: int
    empty_qty: int
    rate: float
    amount: float

@dataclass
class DeliveryPdfData:
    org_name: str
    org_address: str
    org_phone: str
    
    buyer_name: str
    buyer_address: str
    buyer_phone: str
    
    date_display_text: str
    bill_no: str
    
    items: List[DeliveryPdfItemData]
    
    total_bill_amount: float
    cash_collected: float
    upi_collected: float
    opening_balance: float
    closing_balance: float


def generate_delivery_pdf(data: DeliveryPdfData) -> BytesIO:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=20, 
        leftMargin=20, 
        topMargin=20, 
        bottomMargin=20
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=20, 
        leading=26,
        alignment=TA_CENTER,
        spaceAfter=10
    )
    header_style = ParagraphStyle(
        'HeaderStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica', 
        fontSize=11, 
        leading=16,
        alignment=TA_CENTER,
        spaceAfter=5
    )
    details_label_style = ParagraphStyle(
        'DetailsLabel', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=10, 
    )
    details_value_style = ParagraphStyle(
        'DetailsValue', 
        parent=styles['Normal'], 
        fontName='Helvetica', 
        fontSize=10,
    )
    
    # 1. Company Header
    elements.append(Paragraph(data.org_name, title_style))
    elements.append(Paragraph(data.org_address, header_style))
    elements.append(Paragraph(f"Phone : {data.org_phone}", header_style))
    
    elements.append(Spacer(1, 10))
    # Horizontal line
    elements.append(Table([['']], colWidths=['100%'], style=[
        ('LINEABOVE', (0,0), (-1,-1), 1.5, colors.HexColor('#555555')),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(Spacer(1, 10))
    
    # 2. Customer Details & Invoice Info
    customer_data = [
        [Paragraph('<b>Buyer Name :</b>', details_label_style), Paragraph(data.buyer_name, details_value_style), Paragraph('<b>Bill No :</b>', details_label_style), Paragraph(data.bill_no, details_value_style)],
        [Paragraph('<b>Address :</b>', details_label_style), Paragraph(data.buyer_address, details_value_style), Paragraph('<b>Date :</b>', details_label_style), Paragraph(data.date_display_text, details_value_style)],
        [Paragraph('<b>Phone :</b>', details_label_style), Paragraph(data.buyer_phone, details_value_style), "", ""],
    ]
    customer_table = Table(customer_data, colWidths=[90, 250, 60, 150])
    customer_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 2),
    ]))
    elements.append(customer_table)
    elements.append(Spacer(1, 15))
    
    # 3. Item Table
    # Headers: S.No, Item Name, Full Qty, Empty Qty, Rate, Amount
    col_widths = [40, 240, 60, 60, 70, 80]
    table_data = []
    
    header_row = [
        "S.No", "Item Name", "Full", "Empty", "Rate (Rs)", "Amount (Rs)"
    ]
    table_data.append(header_row)
    
    for i, item in enumerate(data.items):
        row = [
            str(i+1),
            Paragraph(f"<b>{item.item_name}</b>", styles['Normal']),
            str(item.full_qty),
            str(item.empty_qty),
            f"{item.rate:,.2f}",
            f"{item.amount:,.2f}"
        ]
        table_data.append(row)
        
    invoice_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    base_table_style = [
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d9d9d9')),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('TOPPADDING', (0,0), (-1,0), 8),
        ('BORDER', (0,0), (-1,0), 1, colors.HexColor('#999999')),
        
        ('ALIGN', (0,1), (-1,-1), 'CENTER'), # S.No
        ('ALIGN', (1,1), (1,-1), 'LEFT'),    # Item name left
        ('ALIGN', (2,1), (4,-1), 'CENTER'),   # Qtys and rate
        ('ALIGN', (5,1), (5,-1), 'RIGHT'),   # Amount right
        
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,1), (-1,-1), 8),
        ('BOTTOMPADDING', (0,1), (-1,-1), 8),
        
        ('INNERGRID', (0,0), (-1,-1), 1, colors.HexColor('#cccccc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cccccc')),
    ]
    
    invoice_table.setStyle(TableStyle(base_table_style))
    elements.append(invoice_table)
    elements.append(Spacer(1, 20))
    
    # 4. Financial Summary
    summary_data = [
        [Paragraph('<b>Bill Amount</b>', styles['Normal']), Paragraph(f"<b>Rs. {data.total_bill_amount:,.2f}</b>", ParagraphStyle('r', alignment=TA_RIGHT))],
        ["Cash Paid", Paragraph(f"Rs. {data.cash_collected:,.2f}", ParagraphStyle('r', alignment=TA_RIGHT))],
        ["UPI Paid", Paragraph(f"Rs. {data.upi_collected:,.2f}", ParagraphStyle('r', alignment=TA_RIGHT))],
        [Paragraph('<b>Previous Balance</b>', styles['Normal']), Paragraph(f"<b>Rs. {data.opening_balance:,.2f}</b>", ParagraphStyle('r', alignment=TA_RIGHT))],
        [Paragraph('<b>New Closing Balance</b>', styles['Normal']), Paragraph(f"<b>Rs. {data.closing_balance:,.2f}</b>", ParagraphStyle('r', alignment=TA_RIGHT))]
    ]
    
    summary_table = Table(summary_data, colWidths=[150, 150])
    summary_table.setStyle(TableStyle([
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (1,0), 1, colors.HexColor('#cccccc')),
        ('LINEBELOW', (0,2), (1,2), 1, colors.HexColor('#cccccc')),
        ('LINEBELOW', (0,3), (1,3), 1, colors.HexColor('#cccccc')),
    ]))
    
    # 5. Arrange summary
    bottom_layout_data = [
        ["", "", summary_table]
    ]
    bottom_layout = Table(bottom_layout_data, colWidths=[240, 10, 300])
    bottom_layout.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    
    elements.append(bottom_layout)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
