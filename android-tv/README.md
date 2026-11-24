# Tempo LDZ para Android TV

O app Android TV está neste subdiretório para manter seus fontes separados da raiz do site. Ele carrega o site em tela cheia e injeta controles próprios para o controle remoto; os arquivos `index.html`, `style.css` e `script.js` da raiz não são alterados pelo build do APK.

## Versão publicada

A release atual é [Tempo LDZ 1.6.0](https://github.com/ludezam/tempoLDZ/releases/tag/v1.6.0). O asset instalável mantém o nome `Tempo-LDZ.apk`, usado pelo TV-LDZ.

- Pacote: `br.com.ldz.tempotv`
- Requisito: Android 8.0 ou superior (API 26+)
- Fonte do app e script de integração: [`Tempo-LDZ-Android-TV-source.zip`](Tempo-LDZ-Android-TV-source.zip)

## Compilar

O ZIP contém os fontes Java/JS, manifestos e arquivos de build. No Windows, copie `tools.example.json` para `tools.local.json`, ajuste os caminhos do JDK/Android SDK locais e execute `./build-apk.ps1` no PowerShell. O script usa a chave local existente em `.android`; a chave e a senha não fazem parte do arquivo público.

As futuras versões devem conservar a mesma chave de assinatura e incrementar `versionCode` para permitir atualização sobre o APK instalado. Para distribuição à TV, publique o APK em Releases como `Tempo-LDZ.apk`.
