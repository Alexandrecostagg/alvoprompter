/** Original generated editorial image, shared by entry and the creation hub. */
export default function CreatorVisual({ compact = false, caption = 'Sua história merece ser contada.' }: { compact?: boolean; caption?: string }) {
  return (
    <div className={`creator-visual ${compact ? 'creator-visual-compact' : ''}`}>
      <img src="/images/creator-studio.webp" alt="Criadora gravando um vídeo com o celular em um estúdio iluminado" width="1200" height="800" fetchPriority={compact ? 'auto' : 'high'} />
      {!compact && <>
        <span className="creator-live"><span /> PRONTO PARA GRAVAR</span>
        <div className="creator-caption" aria-hidden="true"><span>SEU ROTEIRO, NA TELA</span><p>{caption}</p><div><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
      </>}
    </div>
  )
}
