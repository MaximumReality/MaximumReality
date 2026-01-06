<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:template match="/">
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
        * { margin:0; padding:0; background:#000; color:#00e5ff; font-family:'Courier New', monospace; }
        body { padding:25px; border-left: 5px solid #ff00ff; min-height: 100vh; }
        
        .header { border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .glitch-text { text-shadow: 2px 2px #ff00ff; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
        
        .feed-item { 
            border: 1px solid #1a1a1a; padding: 20px; margin-bottom: 25px; 
            background: #050505; position: relative;
        }
        .feed-item:after {
            content: "CONNECTED"; font-size: 8px; position: absolute; bottom: 5px; right: 10px; color: #32cd32;
        }

        h2 { font-size: 14px; margin-bottom: 10px; color: #ff00ff; font-weight: 900; }
        p { font-size: 12px; line-height: 1.6; color: #00e5ff; margin-bottom: 15px; }
        
        .btn { 
            display: inline-block; color: #000; background: #00e5ff; 
            padding: 8px 15px; text-decoration: none; font-size: 10px; font-weight: 900;
        }

        .scanline {
            width: 100%; height: 100%; position: fixed; top: 0; left: 0;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%),
                        linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
            background-size: 100% 3px, 3px 100%; pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="scanline"></div>
    <div class="header">
        <h1 class="glitch-text">📡 <xsl:value-of select="rss/channel/title"/></h1>
        <p style="font-size: 9px; opacity: 0.7;">[ STATUS: INTERCEPTING_SIGNALS_SUCCESSFUL ]</p>
    </div>

    <xsl:for-each select="rss/channel/item">
        <div class="feed-item">
            <h2><xsl:value-of select="title"/></h2>
            <p><xsl:value-of select="description"/></p>
            <a href="{link}" class="btn">[ OPEN_UPLINK ]</a>
        </div>
    </xsl:for-each>

    <div style="text-align: center; padding-top: 50px;">
        <a href="https://maximumreality.xyz/hacked-index.html" style="color:#ff00ff; font-size: 10px;">[ ABORT_SIGNAL_AND_RETURN ]</a>
    </div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
